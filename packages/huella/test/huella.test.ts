import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buscar, huella, huellasDelSpot, leerMuestras, segundosPorCuadro, TASA } from '../src/index';

let hayFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hayFfmpeg = false;
}

describe('huella pura', () => {
  it('el mismo audio da la misma huella y se encuentra a sí mismo con error 0', () => {
    const a = new Float32Array(TASA * 6).map((_, i) => Math.sin((2 * Math.PI * (500 + 300 * Math.sin(i / 3000)) * i) / TASA) * 0.5);
    const h = huella(a);
    expect(h.length).toBeGreaterThan(200);
    const r = buscar(h, [h]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ segundo: 0, error: 0 });
  });

  it('cada cuadro dura unos 23 ms', () => {
    expect(segundosPorCuadro).toBeCloseTo(0.0232, 3);
  });
});

/**
 * Simulación de la emisora: 3 minutos de fondo (música sintética + ruido), el spot insertado en el segundo 97,3, y
 * todo pasado por AAC a 64 kbps como el streaming real. La huella tiene que encontrarlo en su segundo y no
 * confundir otro spot que no sonó.
 */
describe.skipIf(!hayFfmpeg)('encontrar un spot en una grabación comprimida', () => {
  const dir = mkdtempSync(join(tmpdir(), 'huella-'));
  const spot = join(dir, 'spot.wav');
  const otro = join(dir, 'otro.wav');
  const emision = join(dir, 'emision.aac');
  const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);

  beforeAll(() => {
    ff('-f', 'lavfi', '-i', "aevalsrc=0.5*sin(2*PI*(420+260*sin(2*PI*0.7*t))*t)+0.35*sin(2*PI*(910+180*sin(2*PI*1.9*t))*t)+0.2*sin(2*PI*(1500+300*sin(2*PI*3.1*t))*t):s=44100:d=20", spot);
    ff('-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*(650+200*sin(2*PI*1.1*t))*t)+0.3*sin(2*PI*(1200+250*sin(2*PI*0.4*t))*t):s=44100:d=20', otro);
    // Fondo: «música» que cambia lento + ruido rosa; el spot entra en 97,3 s con el fondo bajo (como una tanda).
    ff(
      '-f', 'lavfi', '-i', 'aevalsrc=0.3*sin(2*PI*(330+120*sin(2*PI*0.05*t))*t)+0.2*sin(2*PI*(660+90*sin(2*PI*0.13*t))*t):s=44100:d=180',
      '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.08:seed=7:d=180:r=44100',
      '-i', spot,
      '-filter_complex', '[0][1]amix=inputs=2:normalize=0[fondo];[2]adelay=97300,volume=0.9[s];[fondo][s]amix=inputs=2:normalize=0,volume=0.8[out]',
      '-map', '[out]', '-ac', '2', '-c:a', 'aac', '-b:a', '64k', emision,
    );
  }, 60_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('lo encuentra en el segundo correcto (±0,25 s) y con error bajo', async () => {
    const g = huella(await leerMuestras(emision));
    const r = buscar(g, huellasDelSpot(await leerMuestras(spot)));
    expect(r).toHaveLength(1);
    expect(Math.abs(r[0]!.segundo - 97.3)).toBeLessThan(0.25);
    expect(r[0]!.error).toBeLessThan(0.25);
  }, 60_000);

  it('no encuentra un spot que no sonó', async () => {
    const g = huella(await leerMuestras(emision));
    expect(buscar(g, huellasDelSpot(await leerMuestras(otro)))).toEqual([]);
  }, 60_000);

  it('lee solo un tramo de la grabación cuando se le pide', async () => {
    const m = await leerMuestras(emision, { desde: 90, duracion: 40 });
    expect(m.length / TASA).toBeGreaterThan(39);
    const r = buscar(huella(m), huellasDelSpot(await leerMuestras(spot)));
    expect(Math.abs(90 + r[0]!.segundo - 97.3)).toBeLessThan(0.25);
  }, 60_000);
});
