import { Redis } from 'ioredis';
import { createDb, pingDb } from '@sp/db';
import { buildApp } from './app';
import { loadConfig } from './config';

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 1 });
redis.on('error', () => {}); // /v1/ready informa la caída; no se tumba el proceso.

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
  trustProxy: cfg.trustProxy,
  logger: true,
});

const detener = async () => {
  await app.close();
  await db.destroy();
  redis.disconnect();
};
process.on('SIGTERM', detener);
process.on('SIGINT', detener);

await app.listen({ port: cfg.port, host: cfg.host });
