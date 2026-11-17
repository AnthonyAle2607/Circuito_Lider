/**
 * Carga (o completa) la parrilla de Circuito Líder desde datos/circuito-lider.yaml.
 *   pnpm cargar-parrilla
 * Usa DATABASE_URL_MIGRATOR. Solo añade lo que falta: lo corregido en el panel no se toca.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '@sp/db';
import { cargarParrilla } from './cargar';
import { leerArchivoParrilla } from './datos';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRATOR (copia .env.example a .env).');
  process.exit(2);
}
const ruta = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos/circuito-lider.yaml');
const db = createDb(url, 1);
try {
  const r = await cargarParrilla(db, leerArchivoParrilla(ruta));
  const nada = r.emisoras + r.programas + r.franjas === 0;
  console.log(nada ? 'Parrilla al día: no faltaba nada.' : `Parrilla cargada: ${r.emisoras} emisoras, ${r.programas} programas y ${r.franjas} franjas nuevas.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
