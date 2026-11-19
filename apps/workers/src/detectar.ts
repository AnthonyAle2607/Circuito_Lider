import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buscar, huella, huellasDelSpot, leerMuestras, recortar, TASA, type Hallazgo } from '@sp/huella';
import type { Almacen } from '@sp/spots';

/**
 * PT-7: busca en cada bloque grabado los spots que debían sonar en él y certifica cada emisión encontrada.
 * Cada 2 minutos revisa hasta 3 bloques terminados. Un bloque sin nada que buscar se marca revisado al instante.
 */
export const DETECTAR = { trabajo: 'detectar-emisiones', cadaMs: 120_000, porPasada: 3 } as const;

/** Segundos de audio antes y después del spot en el recorte del certificado. */
export const MARGEN_CLIP_S = 3;
/** Holgura alrededor de la franja: la emisora puede adelantar o atrasar la tanda un poco. */
const HOLGURA_S = 120;

type Consulta = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };

export interface Herramientas {
  db: Consulta;
  almacen: Almacen;
  /** Ruta absoluta de un archivo de grabación (relativo a GRABACIONES_DIR). */
  ruta: (archivo: string) => string;
  /** Inyectables para las pruebas. */
  leer?: typeof leerMuestras;
  cortar?: typeof recortar;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

interface Candidato {
  pedido_id: string;
  anunciante_id: string;
  anuncio_id: string;
  reserva_id: string;
  archivo_clave: string;
  formato: string;
  desde: Date;
  hasta: Date;
}

export async function detectarEmisiones(h: Herramientas): Promise<number> {
  const log = h.log ?? (() => {});
  const { rows: bloques } = await h.db.query(
    `SELECT id, archivo, inicio_at, fin_at FROM grabaciones
      WHERE analizada_at IS NULL AND borrada_at IS NULL AND fin_at < now() - interval '30 seconds'
      ORDER BY fin_at LIMIT $1`,
    [DETECTAR.porPasada],
  );
  let certificados = 0;
  const huellas = new Map<string, { h: Uint32Array[]; duracionS: number }>();
  for (const b of bloques) {
    const inicio = new Date(b.inicio_at as string);
    const fin = new Date(b.fin_at as string);
    const { rows } = await h.db.query('SELECT * FROM candidatos_de_grabacion($1)', [b.id]);
    const candidatos = rows as unknown as Candidato[];
    try {
      for (const c of candidatos) {
        // La huella de cada spot se calcula una sola vez por pasada.
        let spot = huellas.get(c.anuncio_id);
        if (!spot) {
          spot = await huellaDelAnuncio(h, c);
          huellas.set(c.anuncio_id, spot);
        }
        const totalS = (fin.getTime() - inicio.getTime()) / 1000;
        const desdeS = Math.max(0, (new Date(c.desde).getTime() - inicio.getTime()) / 1000 - HOLGURA_S);
        const hastaS = Math.min(totalS, (new Date(c.hasta).getTime() - inicio.getTime()) / 1000 + HOLGURA_S + spot.duracionS);
        if (hastaS - desdeS < spot.duracionS) continue;
        const archivo = h.ruta(String(b.archivo));
        const tramo = await (h.leer ?? leerMuestras)(archivo, { desde: desdeS, duracion: hastaS - desdeS });
        const hallazgos: Hallazgo[] = buscar(huella(tramo), spot.h);
        for (const x of hallazgos) {
          const enBloqueS = desdeS + x.segundo;
          const id = await certificar(h, c, String(b.id), archivo, inicio, enBloqueS, spot.duracionS, x.error);
          if (id) {
            certificados++;
            log('emisión certificada', { certificado: id, anuncio: c.anuncio_id, segundo: Math.round(enBloqueS), parecido: (1 - x.error).toFixed(3) });
          }
        }
      }
      await h.db.query('UPDATE grabaciones SET analizada_at = now() WHERE id = $1', [b.id]);
    } catch (e) {
      // Queda sin revisar: se reintenta en la próxima pasada.
      log('no se pudo revisar un bloque', { grabacion: b.id, error: (e as Error).message });
    }
  }
  return certificados;
}

async function huellaDelAnuncio(h: Herramientas, c: Candidato) {
  const dir = await mkdtemp(join(tmpdir(), 'anuncio-'));
  try {
    const f = join(dir, `spot.${c.formato}`);
    await writeFile(f, await h.almacen.leer(c.archivo_clave));
    const m = await (h.leer ?? leerMuestras)(f);
    return { h: huellasDelSpot(m), duracionS: m.length / TASA };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function certificar(
  h: Herramientas,
  c: Candidato,
  grabacionId: string,
  archivo: string,
  inicio: Date,
  enBloqueS: number,
  duracionS: number,
  error: number,
): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'clip-'));
  try {
    const clip = join(dir, 'clip.mp3');
    await (h.cortar ?? recortar)(archivo, enBloqueS - MARGEN_CLIP_S, duracionS + 2 * MARGEN_CLIP_S, clip);
    const datos = await readFile(clip);
    const sha = createHash('sha256').update(datos).digest();
    const clave = `certificados/${c.anunciante_id}/${randomUUID()}.mp3`;
    await h.almacen.guardar(clave, datos, 'audio/mpeg');
    const { rows } = await h.db.query('SELECT certificar_emision($1, $2, $3, $4, $5, $6, $7, $8, $9) AS id', [
      c.pedido_id,
      c.anuncio_id,
      c.reserva_id,
      grabacionId,
      new Date(inicio.getTime() + enBloqueS * 1000),
      Math.round(duracionS * 1000),
      Math.max(0, Math.min(1, 1 - error)).toFixed(3),
      clave,
      sha,
    ]);
    return (rows[0]?.id as string | null) ?? null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
