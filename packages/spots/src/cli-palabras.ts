/**
 * Carga la lista inicial de palabras prohibidas (`datos/palabras-prohibidas.yaml`). Solo añade las que faltan: las que
 * el equipo desactivó o agregó desde el panel se respetan. Corre con el rol dueño (DATABASE_URL_MIGRATOR).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { leerPalabras } from './archivos';

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRATOR (copia .env.example a .env).');
  process.exit(1);
}
const ruta = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos/palabras-prohibidas.yaml');
const palabras = leerPalabras(ruta);
const db = new pg.Client({ connectionString: url });
await db.connect();
let nuevas = 0;
try {
  for (const p of palabras) {
    const r = await db.query('INSERT INTO palabras_prohibidas (palabra, categoria) VALUES ($1, $2) ON CONFLICT (palabra) DO NOTHING', [p.palabra, p.categoria]);
    nuevas += r.rowCount ?? 0;
  }
  console.log(nuevas ? `Palabras prohibidas: ${nuevas} nuevas.` : 'Palabras prohibidas al día: no faltaba ninguna.');
} finally {
  await db.end();
}
