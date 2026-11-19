import { Redis } from 'ioredis';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, pingDb } from '@sp/db';
import { almacenS3, configS3DelEntorno, leerReglas } from '@sp/spots';
import { buildApp } from './app';
import { loadConfig } from './config';

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 1 });
redis.on('error', () => {}); // /v1/ready informa la caída; no se tumba el proceso.
// Spots: archivos en MinIO; formatos aceptados según config/spots.yaml.
const s3 = configS3DelEntorno();
const reglasSpot = leerReglas(resolve(dirname(fileURLToPath(import.meta.url)), '../../../config/spots.yaml'));

const app = await buildApp({
  comprobaciones: {
    base: () => pingDb(db),
    colas: async () => {
      await redis.ping();
    },
  },
  db,
  mfaKey: cfg.mfaKey,
  portalUrl: cfg.portalUrl,
  avisosEnConsola: cfg.avisosEnConsola,
  redis,
  limites: cfg.limites,
  terminosVersion: cfg.terminosVersion,
  trustProxy: cfg.trustProxy,
  logger: true,
  ...(s3 && { almacen: almacenS3(s3) }),
  formatosSpot: reglasSpot.formatos,
});

const detener = async () => {
  await app.close();
  await db.destroy();
  redis.disconnect();
};
process.on('SIGTERM', detener);
process.on('SIGINT', detener);

await app.listen({ port: cfg.port, host: cfg.host });
