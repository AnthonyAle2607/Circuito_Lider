import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import {
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from 'kysely';
import { PARSERS } from './index';
import { runMigrations } from './migrate';
import type { Database } from './schema';

const MIGRACIONES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations');

/**
 * Solo para pruebas (`@sp/db/testing`): Kysely sobre PGlite, un Postgres real en memoria con UNA conexión.
 * Se comporta como un pool de una conexión: quien la pide espera a que la suelte el anterior, para que dos
 * transacciones simultáneas no mezclen sus BEGIN y `set_config` (patrón de ContentSniper).
 */
class PgliteDriver implements Driver {
  private cola: Promise<void> = Promise.resolve();
  private soltar: (() => void) | null = null;

  constructor(private db: PGlite) {}
  async init() {}
  async acquireConnection(): Promise<DatabaseConnection> {
    const anterior = this.cola;
    let soltar!: () => void;
    this.cola = new Promise<void>((r) => (soltar = r));
    await anterior;
    this.soltar = soltar;
    const db = this.db;
    return {
      async executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
        const r = await db.query<R>(q.sql, [...q.parameters]);
        return { rows: r.rows, numAffectedRows: BigInt(r.affectedRows ?? 0) };
      },
      streamQuery() {
        throw new Error('streamQuery no soportado');
      },
    };
  }
  async beginTransaction(c: DatabaseConnection) {
    await c.executeQuery(CompiledQuery.raw('BEGIN'));
  }
  async commitTransaction(c: DatabaseConnection) {
    await c.executeQuery(CompiledQuery.raw('COMMIT'));
  }
  async rollbackTransaction(c: DatabaseConnection) {
    await c.executeQuery(CompiledQuery.raw('ROLLBACK'));
  }
  async releaseConnection() {
    const s = this.soltar;
    this.soltar = null;
    s?.();
  }
  async destroy() {}
}

export function pgliteKysely(pg: PGlite): Kysely<Database> {
  const dialect: Dialect = {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new PgliteDriver(pg),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
  return new Kysely<Database>({ dialect });
}

/**
 * Base nueva con todas las migraciones aplicadas. Queda como superusuario: las pruebas siembran así y luego pasan a
 * `comoApi()` para comprobar con el rol real de la aplicación (si le faltara un permiso o la RLS le ocultara algo, fallan).
 */
export async function baseDePrueba() {
  const pg = new PGlite({ extensions: { citext }, parsers: PARSERS });
  await runMigrations({ query: (s, p) => pg.query(s, p) as never, exec: (s) => pg.exec(s) }, MIGRACIONES);
  const db = pgliteKysely(pg);
  return {
    pg,
    db,
    comoApi: () => pg.exec('SET ROLE app_api'),
    comoWorker: () => pg.exec('SET ROLE app_worker'),
    comoDueno: () => pg.exec('RESET ROLE'),
    cerrar: async () => {
      await db.destroy();
      await pg.close();
    },
  };
}
