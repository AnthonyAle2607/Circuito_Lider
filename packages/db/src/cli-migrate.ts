import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from './migrate';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRATOR (copia .env.example a .env y exporta las variables).');
  process.exit(1);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations');
// Un solo cliente (no un pool): BEGIN/COMMIT deben ir por la misma conexión.
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { applied, skipped } = await runMigrations(client, dir);
  console.log(`Migraciones aplicadas: ${applied.length ? applied.join(', ') : 'ninguna (todo al día)'}`);
  if (skipped.length) console.log(`Ya estaban: ${skipped.join(', ')}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
