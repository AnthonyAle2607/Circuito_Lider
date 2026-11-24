import pg from 'pg';

/**
 * Da a los roles de la aplicación (app_api, app_worker) la clave que trae su URL en .env. Las migraciones los crean
 * sin acceso; este paso los habilita. Lo corre `pnpm iniciar`, con Docker o con servicios nativos de Windows.
 * Solo acepta esos dos roles: el nombre sale de una URL y no se debe poder usar para tocar otro rol.
 */
const ROLES = { DATABASE_URL: 'app_api', DATABASE_URL_WORKER: 'app_worker' } as const;

const migrador = process.env.DATABASE_URL_MIGRATOR;
if (!migrador) {
  console.error('Falta DATABASE_URL_MIGRATOR en .env.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: migrador });
await client.connect();
try {
  for (const [variable, rol] of Object.entries(ROLES)) {
    const valor = process.env[variable];
    if (!valor) throw new Error(`Falta ${variable} en .env.`);
    const url = new URL(valor);
    const usuario = decodeURIComponent(url.username);
    const clave = decodeURIComponent(url.password);
    if (usuario !== rol) throw new Error(`${variable} debe conectarse con el rol ${rol}, no con «${usuario}».`);
    if (!clave) throw new Error(`${variable} no trae clave.`);
    await client.query(`ALTER ROLE ${client.escapeIdentifier(rol)} WITH LOGIN PASSWORD ${client.escapeLiteral(clave)}`);
  }
  console.log('Roles app_api y app_worker listos.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
