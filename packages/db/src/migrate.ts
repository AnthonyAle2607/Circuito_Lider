import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Lo mínimo que el runner necesita de un cliente: así sirve con `pg` y con PGlite en pruebas. */
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Para scripts con varias sentencias, si el cliente distingue (PGlite). `pg` ya lo permite con `query`. */
  exec?(sql: string): Promise<unknown>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const FILE_RE = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Aplica en orden los `NNNN_nombre.sql` de `dir` que falten. Cada archivo corre en su propia
 * transacción. Si un archivo ya aplicado cambió (otro checksum) se aborta: las migraciones
 * aplicadas no se editan, se añade una nueva.
 */
export async function runMigrations(db: SqlRunner, dir: string): Promise<MigrationResult> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre text PRIMARY KEY,
    checksum text NOT NULL,
    aplicada_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  const done = await db.query('SELECT nombre, checksum FROM schema_migrations');
  const known = new Map(done.rows.map((r) => [String(r.nombre), String(r.checksum)]));

  const result: MigrationResult = { applied: [], skipped: [] };
  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = known.get(file);
    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(`La migración ya aplicada ${file} fue modificada. Crea una nueva en lugar de editarla.`);
      }
      result.skipped.push(file);
      continue;
    }
    await db.query('BEGIN');
    try {
      await (db.exec ? db.exec(sql) : db.query(sql));
      await db.query('INSERT INTO schema_migrations (nombre, checksum) VALUES ($1, $2)', [file, checksum]);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw new Error(`Falló la migración ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    result.applied.push(file);
  }
  return result;
}
