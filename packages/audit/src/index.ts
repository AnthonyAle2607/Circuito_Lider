import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database, TipoActor } from '@sp/db';

export interface Actor {
  tipo: TipoActor;
  /** Usuario del anunciante o miembro del equipo. */
  id?: string;
  /** Agente o proceso (por ejemplo «agente-vendedor», «liberar-reservas»). */
  nombre?: string;
}

export interface Entrada {
  anuncianteId?: string | null;
  actor: Actor;
  /** Verbo en pasado, con punto: «cuenta.registrada», «pedido.pagado». */
  accion: string;
  entidad: string;
  entidadId: string;
  datos?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Añade una fila a la bitácora encadenada. Se llama DENTRO de la transacción del cambio que registra: si el cambio se
 * revierte, la fila también. El hash y la hora los pone la base (trigger), nunca la aplicación.
 * Nunca se guardan secretos ni claves en `datos`.
 */
export async function registrar(trx: Transaction<Database> | Kysely<Database>, e: Entrada): Promise<void> {
  await trx
    .insertInto('bitacora')
    .values({
      anunciante_id: e.anuncianteId ?? null,
      actor_tipo: e.actor.tipo,
      actor_id: e.actor.id ?? null,
      actor_nombre: e.actor.nombre ?? null,
      accion: e.accion,
      entidad: e.entidad,
      entidad_id: e.entidadId,
      datos: JSON.stringify(e.datos ?? {}),
      ip: e.ip ?? null,
    })
    .execute();
}

export interface Verificacion {
  filas: number;
  /** Id de la primera fila alterada o con la cadena rota; null si está íntegra. */
  primeraRota: string | null;
  integra: boolean;
}

/** Recalcula la cadena en la base (función `bitacora_verificar`). */
export async function verificar(db: Kysely<Database>, desde = 0): Promise<Verificacion> {
  const r = await sql<{ filas: string | number; primera_rota: string | number | null }>`
    select filas, primera_rota from bitacora_verificar(${desde})`.execute(db);
  const fila = r.rows[0]!;
  const primeraRota = fila.primera_rota === null ? null : String(fila.primera_rota);
  return { filas: Number(fila.filas), primeraRota, integra: primeraRota === null };
}
