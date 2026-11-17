import { describe, expect, it } from 'vitest';
import { diaIso, dinero, fechaCorta, hoyEnCaracas, proximosLunes } from '../src/lib/fechas';

describe('fechas del portal (hora de Venezuela)', () => {
  it('a las 02:00 UTC todavía es el día anterior en Caracas', () => {
    expect(hoyEnCaracas(new Date('2026-11-18T02:00:00Z'))).toBe('2026-11-17');
  });

  it('los próximos lunes empiezan después de hoy', () => {
    expect(proximosLunes(2, '2026-11-17')).toEqual(['2026-11-23', '2026-11-30']);
    expect(proximosLunes(1, '2026-11-23')).toEqual(['2026-11-30']);
    expect(proximosLunes(3, '2026-11-17').every((f) => diaIso(f) === 1)).toBe(true);
  });

  it('formatea fechas cortas en español', () => {
    expect(fechaCorta('2026-11-23')).toBe('lun 23 nov');
    expect(fechaCorta('2026-12-06')).toBe('dom 6 dic');
  });

  it('muestra dinero sin decimales cuando son exactos', () => {
    expect(dinero(31_350)).toBe('$313,50');
    expect(dinero(90_000)).toMatch(/^\$900$/);
  });
});
