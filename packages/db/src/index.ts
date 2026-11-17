import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

export type { Database } from './schema';
export * from './migrate';

/** Cliente Kysely sobre un pool. Toda consulta usa parámetros enlazados ($1…): nunca se concatena SQL. */
export function createDb(connectionString: string, max = 10): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max }) }),
  });
}

/** Comprueba que la base responde. La usa /v1/ready. */
export async function pingDb(db: Kysely<Database>): Promise<void> {
  await sql`select 1`.execute(db);
}
