/**
 * Las colas de trabajo del sistema. En PT-0 solo existe `sistema` con el latido; cada paquete de trabajo
 * añade la suya (liberar reservas en PT-5, validar spots en PT-6, certificados en PT-7, seguimiento de ventas en PT-5b).
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

/** Lo que hace el trabajo de latido: deja constancia de que los trabajadores procesan la cola. */
export async function latir(redis: { set(k: string, v: string, modo: 'EX', s: number): Promise<unknown> }, ahora = new Date()) {
  await redis.set(LATIDO.clave, ahora.toISOString(), 'EX', LATIDO.vigenciaS);
}
