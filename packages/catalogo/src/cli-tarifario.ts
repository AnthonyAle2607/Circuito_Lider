/**
 * Carga el tarifario de EJEMPLO (datos/tarifario-ejemplo.yaml) solo si la base no tiene ninguno.
 *   pnpm cargar-tarifario-ejemplo
 * Usa DATABASE_URL_MIGRATOR. El tarifario real se publica desde el panel (o la API) como versión nueva.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '@sp/db';
import { cargarTarifarioEjemplo } from './tarifario';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRATOR (copia .env.example a .env).');
  process.exit(2);
}
const db = createDb(url, 1);
try {
  const v = await cargarTarifarioEjemplo(db, resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos/tarifario-ejemplo.yaml'));
  console.log(v === null ? 'Ya hay un tarifario: no se cargó el de ejemplo.' : `Tarifario de EJEMPLO cargado como versión ${v}.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
