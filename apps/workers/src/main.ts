import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { COLAS, LATIDO, latir } from './colas';

const url = process.env.REDIS_URL;
if (!url) {
  console.error('Falta REDIS_URL (copia .env.example a .env).');
  process.exit(1);
}

// BullMQ exige maxRetriesPerRequest: null en las conexiones de los trabajadores.
const conexion = new Redis(url, { maxRetriesPerRequest: null });
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ svc: 'workers', msg, ...extra }));

const cola = new Queue(COLAS.sistema, { connection: conexion });
await cola.upsertJobScheduler('latido', { every: LATIDO.cadaMs }, { name: LATIDO.trabajo });

const trabajador = new Worker(
  COLAS.sistema,
  async (job) => {
    if (job.name === LATIDO.trabajo) await latir(conexion);
  },
  { connection: conexion },
);
trabajador.on('failed', (job, err) => log('trabajo fallido', { trabajo: job?.name, error: err.message }));

log('trabajos en marcha', { colas: Object.values(COLAS) });

const detener = async () => {
  await trabajador.close();
  await cola.close();
  conexion.disconnect();
  process.exit(0);
};
process.on('SIGTERM', detener);
process.on('SIGINT', detener);
