import { describe, expect, it } from 'vitest';
import { argumentosFfmpeg, espera, horasDelBloque, leerLista } from '../src/segmentos';

describe('grabador', () => {
  it('copia la señal sin recomprimir, en bloques alineados con el reloj', () => {
    const a = argumentosFfmpeg({ id: 'x', slug: 'caracas', streamUrl: 'https://acp4.lorini.net:15020/stream' }, 'g/caracas', 'g/caracas/lista.csv', 3600);
    expect(a).toEqual(expect.arrayContaining(['-c', 'copy', '-segment_time', '3600', '-segment_atclocktime', '1']));
    expect(a[a.indexOf('-i') + 1]).toBe('https://acp4.lorini.net:15020/stream');
    expect(a.at(-1)).toBe('g/caracas/%Y%m%d-%H%M%S.mka');
  });

  it('lee la lista de bloques terminados e ignora la línea a medio escribir', () => {
    const l = leerLista('20261119-160000.mka,0.000000,3599.977000\r\n20261119-170000.mka,3599.977000,7199.950000\n20261119-1800');
    expect(l).toEqual([
      { archivo: '20261119-160000.mka', inicioS: 0, finS: 3599.977 },
      { archivo: '20261119-170000.mka', inicioS: 3599.977, finS: 7199.95 },
    ]);
  });

  it('toma la hora del bloque del nombre que le puso ffmpeg (hora local), y su duración de la lista', () => {
    const h = horasDelBloque(new Date('2026-11-19T20:00:00Z'), { archivo: '20261119-165000.mka', inicioS: 41.2, finS: 101.2 });
    expect(h.inicio).toEqual(new Date(2026, 10, 19, 16, 50, 0));
    expect(h.fin.getTime() - h.inicio.getTime()).toBe(60_000);
  });

  it('sin un nombre con fecha, cuenta desde que arrancó ffmpeg', () => {
    const h = horasDelBloque(new Date('2026-11-19T20:00:00Z'), { archivo: 'a', inicioS: 60, finS: 120.5 });
    expect(h).toEqual({ inicio: new Date('2026-11-19T20:01:00Z'), fin: new Date('2026-11-19T20:02:00.500Z') });
  });

  it('reintenta una emisora caída cada vez más espaciado, hasta 5 minutos', () => {
    expect([1, 2, 3, 10].map(espera)).toEqual([10_000, 20_000, 40_000, 300_000]);
  });
});
