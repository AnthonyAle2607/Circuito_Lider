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

/** RF-20: cada minuto, los pedidos pagados con su spot aprobado generan sus órdenes de pauta por emisora. */
export const PROGRAMAR = { trabajo: 'programar', cadaMs: 60_000 } as const;

export async function programar(db: { query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }> }): Promise<number> {
  const r = await db.query('select generar_ordenes() as n');
  return Number(r.rows[0]?.n ?? 0);
}

/** PT-6: cada 10 s se revisan los anuncios subidos (duración, transcripción y palabras prohibidas). */
export const REVISAR = {
  trabajo: 'revisar-anuncios',
  cadaMs: 10_000,
  /** Cuántos anuncios por pasada, para no tapar la cola si llegan muchos juntos. */
  porPasada: 5,
} as const;

type Consulta = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };

/**
 * Toma anuncios pendientes (función de la base, sin que dos trabajadores tomen el mismo), los revisa y guarda el
 * resultado. Si algo falla con uno, queda «procesando» y se reintenta; a los 3 intentos pasa a revisión humana.
 */
export async function revisarAnuncios(
  db: Consulta,
  revisar: (spot: { clave: string; formato: string }, prohibidas: string[]) => Promise<{
    estado: string;
    motivo: string | null;
    duracionMs: number | null;
    transcripcion: string | null;
    coincidencias: unknown[];
  }>,
  log: (msg: string, extra?: Record<string, unknown>) => void = () => {},
): Promise<number> {
  const palabras = (await db.query('SELECT palabra FROM palabras_prohibidas WHERE activa')).rows.map((r) => String(r.palabra));
  let n = 0;
  for (let i = 0; i < REVISAR.porPasada; i++) {
    const { rows } = await db.query('SELECT * FROM tomar_anuncio_pendiente()');
    const a = rows[0];
    if (!a) break;
    try {
      const r = await revisar({ clave: String(a.archivo_clave), formato: String(a.formato) }, palabras);
      await db.query('SELECT resolver_anuncio($1, $2, $3, $4, $5, $6)', [
        a.id,
        r.estado,
        r.motivo,
        r.duracionMs,
        r.transcripcion,
        JSON.stringify(r.coincidencias),
      ]);
      log('anuncio revisado', { anuncio: a.id, estado: r.estado });
      n++;
    } catch (e) {
      log('no se pudo revisar un anuncio', { anuncio: a.id, intento: a.intentos, error: (e as Error).message });
    }
  }
  return n;
}
