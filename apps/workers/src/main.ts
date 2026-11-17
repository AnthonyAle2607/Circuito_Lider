import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import { COLAS, LATIDO, LIBERAR, latir, liberarReservas } from './colas';

const redisUrl = process.env.REDIS_URL;
const dbUrl = process.env.DATABASE_URL_WORKER;
if (!redisUrl || !dbUrl) {
  console.error('Faltan REDIS_URL o DATABASE_URL_WORKER (copia .env.example a .env).');
  process.exit(1);
}

// BullMQ exige maxRetriesPerRequest: null en las conexiones de los trabajadores.
const conexion = new Redis(redisUrl, { maxRetriesPerRequest: null });
// Rol app_worker: sin privilegios; solo puede lo que sus funciones y permisos le dan.
const db = new pg.Pool({ connectionString: dbUrl, max: 4 });
db.on('error', () => {});
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ svc: 'workers', msg, ...extra }));

const cola = new Queue(COLAS.sistema, { connection: conexion });
await cola.upsertJobScheduler('latido', { every: LATIDO.cadaMs }, { name: LATIDO.trabajo });
await cola.upsertJobScheduler('liberar-reservas', { every: LIBERAR.cadaMs }, { name: LIBERAR.trabajo });

const trabajador = new Worker(
  COLAS.sistema,
  async (job) => {
    if (job.name === LATIDO.trabajo) await latir(conexion);
    if (job.name === LIBERAR.trabajo) {
      const n = await liberarReservas(db);
      if (n > 0) log('reservas vencidas liberadas', { pedidos: n });
    }
  },
  { connection: conexion },
);
trabajador.on('failed', (job, err) => log('trabajo fallido', { trabajo: job?.name, error: err.message }));

log('trabajos en marcha', { colas: Object.values(COLAS) });

const detener = async () => {
  await trabajador.close();
  await cola.close();
  await db.end();
  conexion.disconnect();
  process.exit(0);
};
process.on('SIGTERM', detener);
process.on('SIGINT', detener);
