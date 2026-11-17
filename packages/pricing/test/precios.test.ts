import { describe, expect, it } from 'vitest';
import { SinTarifa, cotizar, descuentoPara, duracionesDisponibles, type Emision, type Tarifario } from '../src/index';

const t: Tarifario = {
  id: 't1',
  version: 1,
  moneda: 'USD',
  esEjemplo: true,
  tarifas: [
    { alcance: 'nacional', duracionSegundos: 30, precioCentimos: 6000 },
    { alcance: 'local', duracionSegundos: 30, precioCentimos: 1500 },
    { alcance: 'nacional', duracionSegundos: 60, precioCentimos: 10_000 },
    { alcance: 'local', duracionSegundos: 60, precioCentimos: 2500 },
    { alcance: 'local', duracionSegundos: 45, precioCentimos: 2000 },
  ],
  descuentos: [
    { minEmisiones: 20, descuentoBps: 500 },
    { minEmisiones: 50, descuentoBps: 1000 },
  ],
  umbralAprobacionCentimos: 500_000,
};

const emisiones = (n: number, alcance: Emision['alcance'] = 'local'): Emision[] =>
  Array.from({ length: n }, (_, i) => ({ franjaId: `f${i}`, fecha: '2026-12-01', alcance }));

describe('cotizar', () => {
  it('suma el precio de cada emisión según su alcance', () => {
    const p = cotizar(t, 30, [...emisiones(2, 'nacional'), ...emisiones(3)]);
    expect(p.subtotalCentimos).toBe(2 * 6000 + 3 * 1500);
    expect(p.descuentoCentimos).toBe(0);
    expect(p.totalCentimos).toBe(16_500);
    expect(p.lineas.map((l) => l.precioCentimos)).toEqual([6000, 6000, 1500, 1500, 1500]);
  });

  it('aplica el escalón de descuento más alto alcanzado', () => {
    expect(descuentoPara(t, 19)).toBe(0);
    expect(descuentoPara(t, 20)).toBe(500);
    expect(descuentoPara(t, 75)).toBe(1000);
    const p = cotizar(t, 30, emisiones(20));
    expect(p.subtotalCentimos).toBe(30_000);
    expect(p.descuentoCentimos).toBe(1500);
    expect(p.totalCentimos).toBe(28_500);
  });

  it('redondea el descuento hacia abajo, nunca un centavo de más', () => {
    const raro: Tarifario = { ...t, tarifas: [{ alcance: 'local', duracionSegundos: 30, precioCentimos: 333 }] };
    const p = cotizar(raro, 30, emisiones(20));
    expect(p.subtotalCentimos).toBe(6660);
    expect(p.descuentoCentimos).toBe(333); // 6660 × 5 % = 333,0
    const p2 = cotizar({ ...raro, tarifas: [{ alcance: 'local', duracionSegundos: 30, precioCentimos: 337 }] }, 30, emisiones(20));
    expect(p2.descuentoCentimos).toBe(337); // 6740 × 5 % = 337,0
    const p3 = cotizar({ ...raro, tarifas: [{ alcance: 'local', duracionSegundos: 30, precioCentimos: 339 }] }, 30, emisiones(21));
    expect(p3.descuentoCentimos).toBe(355); // 7119 × 5 % = 355,95 → 355
    expect(p3.totalCentimos + p3.descuentoCentimos).toBe(p3.subtotalCentimos);
  });

  it('pide aprobación desde el umbral', () => {
    expect(cotizar(t, 60, emisiones(49, 'nacional')).requiereAprobacion).toBe(false);
    expect(cotizar(t, 60, emisiones(60, 'nacional')).requiereAprobacion).toBe(true);
  });

  it('rechaza una duración sin precio para alguno de los alcances pedidos', () => {
    expect(() => cotizar(t, 45, emisiones(1, 'nacional'))).toThrow(SinTarifa);
    expect(cotizar(t, 45, emisiones(1, 'local')).totalCentimos).toBe(2000);
  });

  it('no cotiza vacío', () => {
    expect(() => cotizar(t, 30, [])).toThrow(/al menos una/);
  });

  it('ofrece solo las duraciones que existen en los dos alcances', () => {
    expect(duracionesDisponibles(t)).toEqual([30, 60]);
  });
});
