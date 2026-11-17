/**
 * Las colas de trabajo del sistema. `sistema` lleva los trabajos programados (latido y liberar reservas); cada paquete
 * de trabajo añade lo suyo (validar spots en PT-6, certificados en PT-7, seguimiento de ventas en PT-5b).
 */
export const COLAS = {
  sistema: 'sistema',
} as const;

export const LATIDO = {
  trabajo: 'latido',
  clave: 'pautas:trabajos:latido',
  cadaMs: 60_000,
  /** Si el último latido es más viejo que esto, los trabajos están parados. */
  vigenciaS: 180,
} as const;

/** P3: cada minuto se vencen los pedidos sin pagar cuyo plazo pasó y su cupo vuelve al inventario. */
export const LIBERAR = {
  trabajo: 'liberar-reservas',
  cadaMs: 60_000,
} as const;

/** Lo que hace el trabajo de latido: deja constancia de que los trabajadores procesan la cola. */
export async function latir(redis: { set(k: string, v: string, modo: 'EX', s: number): Promise<unknown> }, ahora = new Date()) {
  await redis.set(LATIDO.clave, ahora.toISOString(), 'EX', LATIDO.vigenciaS);
}

/** Corre la función de la base (SECURITY DEFINER, con el rol app_worker). Devuelve cuántos pedidos venció. */
export async function liberarReservas(db: { query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }> }): Promise<number> {
  const r = await db.query('select liberar_reservas_vencidas() as n');
  return Number(r.rows[0]?.n ?? 0);
}
