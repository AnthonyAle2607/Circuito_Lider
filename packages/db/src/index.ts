import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database, RolEquipo } from './schema';

export type * from './schema';
export * from './migrate';
export * from './tenant';

/**
 * Cómo llegan dos tipos desde la base, igual en `pg` y en PGlite (pruebas):
 *  - bigint (int8, OID 20) → number. El dinero va en centavos y los ids de bitácora: muy lejos de 2^53.
 *  - date (OID 1082) → texto «AAAA-MM-DD». Convertido a Date caería en la zona horaria del proceso y una fecha de
 *    Caracas podría correrse un día.
 */
export const PARSERS = {
  20: (v: string) => Number(v),
  1082: (v: string) => v,
} as const;
pg.types.setTypeParser(20, PARSERS[20]);
pg.types.setTypeParser(1082, PARSERS[1082]);

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
