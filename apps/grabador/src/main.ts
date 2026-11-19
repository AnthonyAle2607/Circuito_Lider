/**
 * Grabador de emisoras (PT-7). Un ffmpeg por emisora copia el streaming en bloques de una hora a GRABACIONES_DIR,
 * anota cada bloque terminado en la base (para que el trabajo de detección lo revise) y borra el audio pasado el plazo
 * de retención. Los certificados no dependen de estos archivos: su recorte se guarda aparte y no se borra nunca.
 *
 * Variables: DATABASE_URL_WORKER, GRABACIONES_DIR (por defecto ./grabaciones en la raíz), GRABACION_SEGUNDOS (3600),
 * RETENCION_DIAS (30), GRABAR_EMISORAS (slugs separados por coma; vacío = todas).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { argumentosFfmpeg, espera, horasDelBloque, leerLista, type Emisora } from './segmentos';

const url = process.env.DATABASE_URL_WORKER;
if (!url) {
  console.error('Falta DATABASE_URL_WORKER (copia .env.example a .env).');
  process.exit(1);
}
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = resolve(RAIZ, process.env.GRABACIONES_DIR ?? 'grabaciones');
const SEGUNDOS = Number(process.env.GRABACION_SEGUNDOS ?? 3600);
const RETENCION_DIAS = Number(process.env.RETENCION_DIAS ?? 30);
const SOLO = (process.env.GRABAR_EMISORAS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';

const db = new pg.Pool({ connectionString: url, max: 2 });
db.on('error', () => {});
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ svc: 'grabador', msg, ...extra }));

interface Grabacion {
  e: Emisora;
  proceso: ChildProcess | null;
  arranque: Date;
  lista: string;
  anotados: Set<string>;
  intentos: number;
}
const activas = new Map<string, Grabacion>();
let cerrando = false;

function arrancar(g: Grabacion) {
  if (cerrando) return;
  const carpeta = join(DIR, g.e.slug);
  mkdirSync(carpeta, { recursive: true });
  g.arranque = new Date();
  g.lista = join(carpeta, `lista-${g.arranque.getTime()}.csv`);
  g.anotados = new Set();
  const p = spawn(FFMPEG, argumentosFfmpeg(g.e, carpeta.replace(/\\/g, '/'), g.lista, SEGUNDOS), { stdio: ['ignore', 'ignore', 'pipe'] });
  g.proceso = p;
  let error = '';
  p.stderr!.on('data', (d: Buffer) => (error = (error + d.toString()).slice(-500)));
  p.on('exit', (codigo) => {
    g.proceso = null;
    void anotar(g); // el último bloque se cierra al salir
    if (cerrando) return;
    g.intentos++;
    const ms = espera(g.intentos);
    log('emisora caída; se reintenta', { emisora: g.e.slug, codigo, reintentoEnS: ms / 1000, error: error.trim().slice(-200) });
    setTimeout(() => arrancar(g), ms);
  });
  log('grabando', { emisora: g.e.slug, bloqueS: SEGUNDOS });
}

/** Anota en la base los bloques que ffmpeg ya cerró. */
async function anotar(g: Grabacion) {
  if (!existsSync(g.lista)) return;
  for (const b of leerLista(readFileSync(g.lista, 'utf8'))) {
    if (g.anotados.has(b.archivo)) continue;
    const ruta = join(DIR, g.e.slug, b.archivo);
    if (!existsSync(ruta)) continue;
    const { inicio, fin } = horasDelBloque(g.arranque, b);
    try {
      await db.query(
        'INSERT INTO grabaciones (emisora_id, archivo, inicio_at, fin_at, bytes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (archivo) DO NOTHING',
        [g.e.id, `${g.e.slug}/${b.archivo}`, inicio, fin, statSync(ruta).size],
      );
      g.anotados.add(b.archivo);
      g.intentos = 0;
      log('bloque grabado', { emisora: g.e.slug, archivo: b.archivo, minutos: Math.round((b.finS - b.inicioS) / 60) });
    } catch (e) {
      log('no se pudo anotar un bloque', { emisora: g.e.slug, error: (e as Error).message });
    }
  }
}

/** Borra el audio de los bloques ya revisados y más viejos que el plazo. Los certificados guardan su propio recorte. */
async function limpiar() {
  const { rows } = await db.query<{ id: string; archivo: string }>(
    `SELECT id, archivo FROM grabaciones WHERE borrada_at IS NULL AND analizada_at IS NOT NULL AND fin_at < now() - make_interval(days => $1)`,
    [RETENCION_DIAS],
  );
  for (const r of rows) {
    rmSync(join(DIR, r.archivo), { force: true });
    await db.query('UPDATE grabaciones SET borrada_at = now() WHERE id = $1', [r.id]);
  }
  if (rows.length) log('grabaciones viejas borradas', { bloques: rows.length, retencionDias: RETENCION_DIAS });
}

const { rows } = await db.query<{ id: string; slug: string; stream_url: string | null }>('SELECT id, slug, stream_url FROM emisoras WHERE activa ORDER BY slug');
for (const r of rows) {
  if (!r.stream_url || (SOLO.length && !SOLO.includes(r.slug))) continue;
  const g: Grabacion = { e: { id: r.id, slug: r.slug, streamUrl: r.stream_url }, proceso: null, arranque: new Date(), lista: '', anotados: new Set(), intentos: 0 };
  activas.set(r.slug, g);
  arrancar(g);
}
log('grabador en marcha', { emisoras: [...activas.keys()], carpeta: DIR, retencionDias: RETENCION_DIAS });

const anotador = setInterval(() => activas.forEach((g) => void anotar(g)), 15_000);
const limpieza = setInterval(() => void limpiar().catch((e) => log('fallo al limpiar', { error: (e as Error).message })), 60 * 60_000);
void limpiar().catch(() => {});

const detener = async () => {
  cerrando = true;
  clearInterval(anotador);
  clearInterval(limpieza);
  // ffmpeg cierra el bloque en curso al recibir «q»/SIGINT; se espera un momento y se anota.
  activas.forEach((g) => g.proceso?.kill('SIGINT'));
  await new Promise((r) => setTimeout(r, 3000));
  await Promise.all([...activas.values()].map(anotar));
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', detener);
process.on('SIGINT', detener);
