import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@sp/db';

type Db = Kysely<Database> | Transaction<Database>;

/** Segundos que se quieren tomar (o devolver) en una franja en una fecha. */
export interface Pedida {
  franjaId: string;
  fecha: string;
  segundos: number;
}

export class SinCupo extends Error {
  constructor(readonly faltantes: Array<{ franjaId: string; fecha: string }>) {
    super(`No queda cupo en ${faltantes.length} ${faltantes.length === 1 ? 'franja' : 'franjas'}.`);
  }
}

/** Orden fijo de bloqueo: dos reservas que tocan las mismas franjas las bloquean en el mismo orden y no se traban. */
const enOrden = (p: Pedida[]) => [...p].sort((a, b) => a.franjaId.localeCompare(b.franjaId) || a.fecha.localeCompare(b.fecha));

/**
 * Toma los segundos pedidos (invariante P2). Debe correr DENTRO de la transacción que crea el pedido y las reservas:
 * si algo falla después, todo se revierte y el cupo vuelve solo.
 *
 * Cada franja/fecha se toma con un único UPDATE condicionado: Postgres bloquea la fila y vuelve a evaluar la condición
 * con el valor ya actualizado por quien ganó antes, así que dos reservas sobre el último segundo no pueden ganar las
 * dos. La capacidad se lee de la franja en ese momento (si programación la bajó, vale la nueva). Si alguna no cabe,
 * lanza SinCupo con TODAS las que no cupieron, para que el cliente sepa cuáles cambiar.
 */
export async function tomarCupos(trx: Transaction<Database>, pedidas: Pedida[]): Promise<void> {
  const faltantes: Array<{ franjaId: string; fecha: string }> = [];
  for (const p of enOrden(pedidas)) {
    await trx.insertInto('cupos').values({ franja_id: p.franjaId, fecha: p.fecha }).onConflict((oc) => oc.doNothing()).execute();
    const r = await sql<{ franja_id: string }>`
      UPDATE cupos c SET segundos_usados = c.segundos_usados + ${p.segundos}
        FROM franjas f
       WHERE c.franja_id = f.id AND c.franja_id = ${p.franjaId} AND c.fecha = ${p.fecha}
         AND f.activa AND c.segundos_usados + ${p.segundos} <= f.segundos_tanda
      RETURNING c.franja_id`.execute(trx);
    if (r.rows.length === 0) faltantes.push({ franjaId: p.franjaId, fecha: p.fecha });
  }
  if (faltantes.length) throw new SinCupo(faltantes);
}

/** Devuelve segundos al inventario (cancelación). Nunca deja un cupo en negativo: la base lo impide. */
export async function devolverCupos(trx: Transaction<Database>, pedidas: Pedida[]): Promise<void> {
  for (const p of enOrden(pedidas)) {
    await trx
      .updateTable('cupos')
      .set((eb) => ({ segundos_usados: eb('segundos_usados', '-', p.segundos) }))
      .where('franja_id', '=', p.franjaId)
      .where('fecha', '=', p.fecha)
      .execute();
  }
}

export interface Libre {
  franjaId: string;
  fecha: string;
  capacidad: number;
  usados: number;
  libres: number;
}

/** Segundos libres de cada franja en cada fecha pedida (solo franjas activas). */
export async function segundosLibres(db: Db, consultas: Array<{ franjaId: string; fecha: string }>): Promise<Libre[]> {
  if (consultas.length === 0) return [];
  const franjaIds = [...new Set(consultas.map((c) => c.franjaId))];
  const fechas = [...new Set(consultas.map((c) => c.fecha))];
  const capacidad = new Map(
    (await db.selectFrom('franjas').select(['id', 'segundos_tanda']).where('id', 'in', franjaIds).where('activa', '=', true).execute()).map((f) => [
      f.id,
      f.segundos_tanda,
    ]),
  );
  const usados = new Map(
    (
      await db
        .selectFrom('cupos')
        .select(['franja_id', 'fecha', 'segundos_usados'])
        .where('franja_id', 'in', franjaIds)
        .where('fecha', 'in', fechas)
        .execute()
    ).map((c) => [`${c.franja_id}|${c.fecha}`, c.segundos_usados]),
  );
  return consultas
    .filter((c) => capacidad.has(c.franjaId))
    .map((c) => {
      const cap = capacidad.get(c.franjaId)!;
      const u = usados.get(`${c.franjaId}|${c.fecha}`) ?? 0;
      return { franjaId: c.franjaId, fecha: c.fecha, capacidad: cap, usados: u, libres: Math.max(0, cap - u) };
    });
}

/** Día ISO (1 = lunes … 7 = domingo) de una fecha «AAAA-MM-DD», sin depender de la zona horaria del proceso. */
export function diaIso(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Hoy en Venezuela (America/Caracas, UTC−4 todo el año) como «AAAA-MM-DD». */
export function hoyEnCaracas(ahora = new Date()): string {
  return new Date(ahora.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

/** Suma días a una fecha «AAAA-MM-DD». */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
