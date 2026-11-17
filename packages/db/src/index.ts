import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database, RolEquipo } from './schema';

export type * from './schema';
export * from './migrate';
export * from './tenant';

/** Cliente Kysely sobre un pool. Toda consulta usa parámetros enlazados ($1…): nunca se concatena SQL. */
export function createDb(connectionString: string, max = 10): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max }) }),
  });
}

/**
 * Los roles del equipo como lista. Un arreglo de un tipo propio (`rol_equipo[]`) llega del driver como el texto
 * `{ventas,revisor}`; convertido a `text[]` llega como arreglo. Úsalo siempre que se seleccionen los roles.
 */
export const rolesEquipo = sql<RolEquipo[]>`equipo.roles::text[]`.as('roles');

/** Comprueba que la base responde. La usa /v1/ready. */
export async function pingDb(db: Kysely<Database>): Promise<void> {
  await sql`select 1`.execute(db);
}
