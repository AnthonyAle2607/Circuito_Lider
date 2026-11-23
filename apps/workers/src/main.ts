import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pasarelaDelEntorno } from '@sp/payments';
import { almacenS3, configS3DelEntorno, leerReglas, revisarSpot, transcriptorDelEntorno } from '@sp/spots';
import { COLAS, LATIDO, LIBERAR, REVISAR, latir, liberarReservas, revisarAnuncios } from './colas';
import { AVISOS, despacharAvisos, destinoDelEntorno } from './avisos';
import { CONCILIAR, conciliarPagos } from './conciliar';
import { DETECTAR, detectarEmisiones } from './detectar';

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

// PT-6: revisión de anuncios. Sin MinIO no hay archivos que revisar; sin Whisper todo pasa a revisión humana.
const s3 = configS3DelEntorno();
const reglas = leerReglas(resolve(dirname(fileURLToPath(import.meta.url)), '../../../config/spots.yaml'));
const transcriptor = transcriptorDelEntorno();
const herramientas = s3 ? { almacen: almacenS3(s3), transcriptor } : null;
if (herramientas) await cola.upsertJobScheduler('revisar-anuncios', { every: REVISAR.cadaMs }, { name: REVISAR.trabajo });
// PT-7: detección de emisiones en los bloques que deja el grabador (pnpm grabar), en GRABACIONES_DIR.
const grabaciones = resolve(dirname(fileURLToPath(import.meta.url)), '../../..', process.env.GRABACIONES_DIR ?? 'grabaciones');
if (herramientas) await cola.upsertJobScheduler('detectar-emisiones', { every: DETECTAR.cadaMs }, { name: DETECTAR.trabajo });
// PT-5: conciliación de pagos con la misma pasarela (y las mismas sesiones en Redis) que la API.
const pasarela = pasarelaDelEntorno(process.env, { get: (k) => conexion.get(k), set: (k, v) => conexion.set(k, v, 'EX', 7 * 86_400) });
await cola.upsertJobScheduler('conciliar-pagos', { every: CONCILIAR.cadaMs }, { name: CONCILIAR.trabajo });
// Avisos (outbox → n8n). Sin AVISOS_URL los eventos esperan en el outbox hasta que haya destino.
const destinoAvisos = destinoDelEntorno(process.env);
if (destinoAvisos) await cola.upsertJobScheduler('despachar-avisos', { every: AVISOS.cadaMs }, { name: AVISOS.trabajo });
log('avisos', { destino: destinoAvisos ? new URL(destinoAvisos.url).host : 'ninguno (esperan en el outbox)' });
log('revisión de anuncios', { almacen: Boolean(s3), transcriptor: transcriptor?.nombre ?? 'ninguno (todo a revisión humana)' });

const trabajador = new Worker(
  COLAS.sistema,
  async (job) => {
    if (job.name === LATIDO.trabajo) await latir(conexion);
    if (job.name === LIBERAR.trabajo) {
      const n = await liberarReservas(db);
      if (n > 0) log('reservas vencidas liberadas', { pedidos: n });
    }
    if (job.name === CONCILIAR.trabajo) await conciliarPagos(db, pasarela, log);
    if (job.name === AVISOS.trabajo && destinoAvisos) await despacharAvisos(db, destinoAvisos, undefined, log);
    if (job.name === DETECTAR.trabajo && herramientas) {
      await detectarEmisiones({ db, almacen: herramientas.almacen, ruta: (a) => resolve(grabaciones, a), log });
    }
    if (job.name === REVISAR.trabajo && herramientas) {
      await revisarAnuncios(db, (spot, prohibidas) => revisarSpot(herramientas, spot, reglas, prohibidas), log);
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
