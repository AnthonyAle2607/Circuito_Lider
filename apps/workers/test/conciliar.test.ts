import { describe, expect, it } from 'vitest';
import { almacenEnMemoria, pasarelaDePrueba } from '@sp/payments';
import { conciliarPagos } from '../src/conciliar';

const pasarela = pasarelaDePrueba({ secreto: 'secreto-de-la-pasarela-de-prueba-0123456789', urlPagina: (r) => r, almacen: almacenEnMemoria() });
const pedir = { pagoId: 'p', montoCentimos: 6000, moneda: 'USD', descripcion: 'd', urlExito: 'u', urlCancelar: 'u', venceAt: new Date(Date.now() + 60_000) };

/** Una base falsa que devuelve las sesiones por conciliar y anota cada resolver_pago. */
function base(referencias: string[]) {
  const resoluciones: unknown[][] = [];
  return {
    resoluciones,
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes('pagos_por_conciliar')) return { rows: referencias.map((r) => ({ proveedor: 'prueba', referencia_externa: r })) };
      resoluciones.push(params);
      return { rows: [{ r: 'confirmado' }] };
    },
  };
}

describe('conciliar pagos', () => {
  it('lleva a la base los pagos que la pasarela ya resolvió y deja los pendientes', async () => {
    const pagada = await pasarela.crearSesion(pedir);
    const abierta = await pasarela.crearSesion(pedir);
    await pasarela.resolver(pagada.referencia, 'aprobado');
    const db = base([pagada.referencia, abierta.referencia]);
    expect(await conciliarPagos(db, pasarela)).toBe(1);
    expect(db.resoluciones).toHaveLength(1);
    expect(db.resoluciones[0]!.slice(0, 6)).toEqual(['prueba', `conciliacion:${pagada.referencia}:aprobado`, pagada.referencia, 'aprobado', 6000, 'USD']);
  });

  it('ignora sesiones de otro proveedor', async () => {
    const db = base([]);
    db.query = async (sql: string) => (sql.includes('pagos_por_conciliar') ? { rows: [{ proveedor: 'otra', referencia_externa: 'x' }] } : { rows: [] });
    expect(await conciliarPagos(db, pasarela)).toBe(0);
  });
});
