import { describe, expect, it } from 'vitest';
import { LATIDO, latir } from '../src/colas';

describe('latido', () => {
  it('guarda la hora con vencimiento', async () => {
    const llamadas: unknown[][] = [];
    await latir({ set: async (...a: unknown[]) => llamadas.push(a) }, new Date('2026-11-17T12:00:00Z'));
    expect(llamadas).toEqual([[LATIDO.clave, '2026-11-17T12:00:00.000Z', 'EX', LATIDO.vigenciaS]]);
  });

  it('el vencimiento cubre al menos dos latidos perdidos', () => {
    expect(LATIDO.vigenciaS * 1000).toBeGreaterThanOrEqual(LATIDO.cadaMs * 2);
  });
});
