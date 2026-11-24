import Anthropic from '@anthropic-ai/sdk';
import { Redis } from 'ioredis';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, pingDb } from '@sp/db';
import { leerConfigPagos, pasarelaDelEntorno } from '@sp/payments';
import { leerConfigAgente } from '@sp/sales-agent';
import { almacenDelEntorno, leerReglas } from '@sp/spots';
import { buildApp } from './app';
import { loadConfig } from './config';

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);
const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 1 });
redis.on('error', () => {}); // /v1/ready informa la caída; no se tumba el proceso.
// Spots: archivos en disco local o en el almacén S3 configurado.
const almacen = almacenDelEntorno();
const reglasSpot = leerReglas(resolve(dirname(fileURLToPath(import.meta.url)), '../../../config/spots.yaml'));
// Pagos (PT-5): la pasarela guarda sus sesiones en Redis para que la conciliación de los trabajos vea las mismas.
const pasarela = pasarelaDelEntorno(process.env, { get: (k) => redis.get(k), set: (k, v) => redis.set(k, v, 'EX', 7 * 86_400) });
// Agente vendedor (PT-5b): solo con credenciales de la API de Claude; sin ellas el chat usa las respuestas fijas.
const conClave = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const agente = conClave ? { cliente: new Anthropic(), config: leerConfigAgente(resolve(dirname(fileURLToPath(import.meta.url)), '../../../config/agente.yaml')) } : undefined;
const pagos = leerConfigPagos(resolve(dirname(fileURLToPath(import.meta.url)), '../../../config/pagos.yaml'));

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
  ...(almacen && { almacen }),
  formatosSpot: reglasSpot.formatos,
  pasarela,
  ...(agente && { agente }),
  transferencia: { datos: pagos.transferencia, maximoBytes: pagos.comprobanteMaxBytes },
});

const detener = async () => {
  await app.close();
  await db.destroy();
  redis.disconnect();
};
process.on('SIGTERM', detener);
process.on('SIGINT', detener);

await app.listen({ port: cfg.port, host: cfg.host });
