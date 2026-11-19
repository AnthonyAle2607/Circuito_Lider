import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { almacenEnMemoria } from '@sp/spots';
import { detectarEmisiones } from '../src/detectar';

let hayFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hayFfmpeg = false;
}

describe.skipIf(!hayFfmpeg)('detectar emisiones en un bloque grabado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'detectar-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);

  it('encuentra el spot en su segundo, guarda el recorte y certifica una vez', async () => {
    const spot = join(dir, 'spot.mp3');
    ff('-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*(420+260*sin(2*PI*0.7*t))*t)+0.3*sin(2*PI*(980+150*sin(2*PI*2.1*t))*t):s=44100:d=15', '-c:a', 'libmp3lame', spot);
    // Bloque de 4 minutos: fondo, y el spot reemplazándolo desde el segundo 130 (como en una tanda).
    const fondo = 'aevalsrc=0.3*sin(2*PI*(330+120*sin(2*PI*0.05*t))*t)+0.2*sin(2*PI*(660+90*sin(2*PI*0.13*t))*t):s=44100';
    ff('-f', 'lavfi', '-i', `${fondo}:d=130`, '-i', spot, '-f', 'lavfi', '-i', `${fondo}:d=95`,
      '-filter_complex', '[1]aresample=44100,aformat=channel_layouts=mono[s];[0][s][2]concat=n=3:v=0:a=1[o]', '-map', '[o]', '-c:a', 'aac', '-b:a', '64k', join(dir, 'bloque.mka'));

    const almacen = almacenEnMemoria();
    await almacen.guardar('anuncios/c/a.mp3', readFileSync(spot), 'audio/mpeg');
    const inicio = new Date('2026-11-23T10:00:00Z'); // 06:00 en Caracas
    const certificados: unknown[][] = [];
    let analizada = false;
    const db = {
      async query(sql: string, params?: unknown[]) {
        if (sql.includes('FROM grabaciones')) return { rows: analizada ? [] : [{ id: 'g1', archivo: 'bloque.mka', inicio_at: inicio, fin_at: new Date(inicio.getTime() + 240_000) }] };
        if (sql.includes('candidatos_de_grabacion'))
          return {
            rows: [{ pedido_id: 'p1', anunciante_id: 'c', anuncio_id: 'a1', reserva_id: 'r1', archivo_clave: 'anuncios/c/a.mp3', formato: 'mp3', desde: inicio, hasta: new Date(inicio.getTime() + 240_000) }],
          };
        if (sql.includes('certificar_emision')) {
          certificados.push(params!);
          return { rows: [{ id: `cert${certificados.length}` }] };
        }
        if (sql.includes('analizada_at = now()')) analizada = true;
        return { rows: [] };
      },
    };

    const n = await detectarEmisiones({ db, almacen, ruta: (a) => join(dir, a) });
    expect(n).toBe(1);
    expect(analizada).toBe(true);
    const [pedido, anuncio, reserva, grabacion, emitido, duracionMs, parecido, clave, sha] = certificados[0]!;
    expect([pedido, anuncio, reserva, grabacion]).toEqual(['p1', 'a1', 'r1', 'g1']);
    expect(Math.abs((emitido as Date).getTime() - inicio.getTime() - 130_000)).toBeLessThan(300);
    expect(Math.abs((duracionMs as number) - 15_000)).toBeLessThan(200);
    expect(Number(parecido)).toBeGreaterThan(0.75);
    // El recorte guardado es un MP3 real de ~21 s (3 s antes y después) y su huella SHA-256 es la que se certifica.
    const clip = await almacen.leer(clave as string);
    expect(clip.length).toBeGreaterThan(10_000);
    expect((sha as Buffer).length).toBe(32);

    // Una segunda pasada no vuelve a revisar el bloque.
    expect(await detectarEmisiones({ db, almacen, ruta: (a) => join(dir, a) })).toBe(0);
  }, 120_000);
});
