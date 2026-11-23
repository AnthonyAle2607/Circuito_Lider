import type { Pasarela } from '@sp/payments';

/**
 * PT-5: conciliación de pagos. Cada 2 min se pregunta a la pasarela por las sesiones que siguen pendientes después
 * de 3 min, por si un aviso se perdió. El resultado entra por la misma función que los avisos (`resolver_pago`), con
 * un id de evento propio por estado: conciliar dos veces lo mismo no cambia nada (P5).
 */
export const CONCILIAR = {
  trabajo: 'conciliar-pagos',
  cadaMs: 120_000,
  /** Antes de esto, una sesión pendiente es normal: el cliente sigue en la página de pago. */
  mayoresDe: '3 minutes',
} as const;

type Consulta = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };

export async function conciliarPagos(db: Consulta, pasarela: Pasarela, log: (msg: string, extra?: Record<string, unknown>) => void = () => {}): Promise<number> {
  const { rows } = await db.query('SELECT * FROM pagos_por_conciliar($1::interval)', [CONCILIAR.mayoresDe]);
  let cambios = 0;
  for (const f of rows) {
    if (f.proveedor !== pasarela.nombre) continue;
    const referencia = String(f.referencia_externa);
    try {
      const e = await pasarela.consultar(referencia);
      if (e.estado === 'pendiente') continue;
      const r = await db.query(
        `SELECT resolver_pago($1, $2, 'conciliacion', $3, $4::estado_pago, $5, $6, $7::jsonb) AS r`,
        [pasarela.nombre, `conciliacion:${referencia}:${e.estado}`, referencia, e.estado, e.montoCentimos, e.moneda, JSON.stringify(e)],
      );
      const resultado = String(r.rows[0]?.r);
      if (resultado !== 'duplicado' && resultado !== 'sin_cambio') cambios++;
      log('pago conciliado', { referencia, estado: e.estado, resultado });
    } catch (err) {
      log('no se pudo conciliar un pago', { referencia, error: (err as Error).message });
    }
  }
  return cambios;
}
