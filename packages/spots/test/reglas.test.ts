import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { almacenEnMemoria, buscarPalabras, decidir, formatoDe, leerPalabras, leerReglas, medirDuracionMs, normalizar, revisarSpot, type Reglas } from '../src/index';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const reglas: Reglas = { duracionMaximaSegundos: 40, alEncontrarPalabra: 'revision' };

describe('normalizar y buscar palabras', () => {
  it('quita tildes, diéresis, mayúsculas y signos', () => {
    expect(normalizar('¡Güevón, CÓMO estás!')).toBe('guevon como estas');
  });

  it('busca la palabra entera, con su segundo y su contexto', () => {
    const c = buscarPalabras(
      [
        { inicio: 0, fin: 5, texto: 'Llegó la nueva computadora, sin disputa.' },
        { inicio: 5, fin: 10, texto: 'Esto es una mierda de oferta, ¡qué vaina!' },
        { inicio: 10, fin: 14, texto: 'Hijo de puta, otra vez Mierda.' },
      ],
      ['puta', 'mierda', 'hijo de puta'],
    );
    expect(c.map((x) => [x.palabra, x.segundo])).toEqual([
      ['mierda', 6],
      ['hijo de puta', 10],
      ['puta', 11],
      ['mierda', 13],
    ]);
    expect(c[0]!.contexto).toBe('Esto es una mierda de oferta, ¡qué vaina!');
  });

  it('la lista real carga sus 100 palabras sin repetidas', () => {
    const p = leerPalabras(join(RAIZ, 'datos/palabras-prohibidas.yaml'));
    expect(p).toHaveLength(100);
    expect(new Set(p.map((x) => normalizar(x.palabra))).size).toBe(100);
  });
});

describe('decidir', () => {
  it('rechaza solo lo que pasa de la duración, con margen para el relleno del códec', () => {
    expect(decidir(reglas, 40_200, []).estado).toBe('aprobado');
    const d = decidir(reglas, 41_300, []);
    expect(d).toMatchObject({ estado: 'rechazado' });
    expect(d.motivo).toContain('41,3 s');
  });

  it('una palabra prohibida manda a revisión humana; sin transcripción también', () => {
    expect(decidir(reglas, 30_000, [{ palabra: 'mierda', segundo: 3, contexto: '' }])).toMatchObject({ estado: 'en_revision' });
    expect(decidir(reglas, 30_000, null)).toMatchObject({ estado: 'en_revision' });
    expect(decidir({ ...reglas, alEncontrarPalabra: 'rechazo' }, 30_000, [{ palabra: 'mierda', segundo: 3, contexto: '' }]).estado).toBe('rechazado');
  });

  it('acepta solo MP4, MP3 y WAV', () => {
    expect(formatoDe('Spot Navidad.MP3')).toBe('mp3');
    expect(formatoDe('spot.mov')).toBeNull();
  });

  it('las reglas del proyecto son 40 s y revisión', () => {
    expect(leerReglas(join(RAIZ, 'config/spots.yaml'))).toMatchObject({ duracionMaximaSegundos: 40, alEncontrarPalabra: 'revision' });
  });
});

describe('revisar un spot de punta a punta', () => {
  const h = (ms: number, texto: string) => {
    const almacen = almacenEnMemoria();
    return {
      almacen,
      medir: async () => ms,
      extraer: async () => {},
      transcriptor: { nombre: 'prueba', transcribir: async () => [{ inicio: 0, fin: 4, texto }] },
    };
  };

  it('limpio y en duración: aprobado, con la transcripción', async () => {
    const x = h(30_000, 'Compra en Acme, la mejor bebida.');
    await x.almacen.guardar('a.mp3', Buffer.from('x'), 'audio/mpeg');
    expect(await revisarSpot(x, { clave: 'a.mp3', formato: 'mp3' }, reglas, ['mierda'])).toMatchObject({
      estado: 'aprobado',
      duracionMs: 30_000,
      transcripcion: 'Compra en Acme, la mejor bebida.',
    });
  });

  it('con una grosería: a revisión con la coincidencia', async () => {
    const x = h(30_000, 'Qué mierda tan buena.');
    await x.almacen.guardar('a.mp3', Buffer.from('x'), 'audio/mpeg');
    const r = await revisarSpot(x, { clave: 'a.mp3', formato: 'mp3' }, reglas, ['mierda']);
    expect(r.estado).toBe('en_revision');
    expect(r.coincidencias).toHaveLength(1);
  });

  it('demasiado largo: rechazado sin transcribir', async () => {
    const x = h(55_000, 'no debería transcribirse');
    let llamado = false;
    x.transcriptor.transcribir = async () => ((llamado = true), []);
    await x.almacen.guardar('a.mp3', Buffer.from('x'), 'audio/mpeg');
    expect((await revisarSpot(x, { clave: 'a.mp3', formato: 'mp3' }, reglas, [])).estado).toBe('rechazado');
    expect(llamado).toBe(false);
  });

  it('un archivo ilegible se rechaza con un motivo claro', async () => {
    const x = { ...h(0, ''), medir: async () => Promise.reject(new Error('no es audio')) };
    await x.almacen.guardar('a.mp3', Buffer.from('x'), 'audio/mpeg');
    const r = await revisarSpot(x, { clave: 'a.mp3', formato: 'mp3' }, reglas, []);
    expect(r).toMatchObject({ estado: 'rechazado', duracionMs: null });
  });
});

// Con ffmpeg instalado (la CI de GitHub lo trae) se mide un tono real de 3 s.
let hayFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hayFfmpeg = false;
}
describe.skipIf(!hayFfmpeg)('ffprobe de verdad', () => {
  it('mide la duración de un MP3 generado', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tono-'));
    try {
      const f = join(dir, 'tono.mp3');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-y', f]);
      expect(readFileSync(f).length).toBeGreaterThan(1000);
      const ms = await medirDuracionMs(f);
      expect(ms).toBeGreaterThan(2900);
      expect(ms).toBeLessThan(3200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
