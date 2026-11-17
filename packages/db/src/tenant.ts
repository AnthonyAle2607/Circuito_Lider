import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from './schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Abre una transacción y fija el anunciante para la RLS **solo dentro de ella** (`set_config(..., true)`, igual que
 * `SET LOCAL`): al terminar se descarta, así una conexión del pool nunca arrastra el anunciante de la petición anterior.
 * Toda consulta sobre datos de un anunciante pasa por aquí. Si `fn` lanza, se revierte todo: es lo que hace atómico
 * «cambio de estado + bitácora + evento en el outbox».
 */
export async function withTenant<T>(
  db: Kysely<Database>,
  anuncianteId: string,
  fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  if (!UUID.test(anuncianteId)) throw new Error('withTenant: anuncianteId no es un uuid válido');
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.anunciante_id', ${anuncianteId}, true)`.execute(trx);
    return fn(trx);
  });
}

/** Transacción sin anunciante: para lo que no le pertenece a ninguno (sesiones, equipo, catálogo). La RLS no deja ver nada de anunciantes. */
export function withSistema<T>(db: Kysely<Database>, fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  return db.transaction().execute(fn);
}
