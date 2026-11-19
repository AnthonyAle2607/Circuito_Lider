import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { Redis } from 'ioredis';
import type { Kysely } from 'kysely';
import type { Database } from '@sp/db';
import type { Almacen } from '@sp/spots';
import { manejarErrores } from './plugins/errores';
import { rutasAnuncios } from './routes/anuncios';
import { rutasCatalogo } from './routes/catalogo';
import { rutasCertificados } from './routes/certificados';
import { rutasCotizaciones } from './routes/cotizaciones';
import { rutasCuentas } from './routes/cuentas';
import { rutasPanelCatalogo } from './routes/panel/catalogo';
import { rutasPanelVentas } from './routes/panel/ventas';
import { rutasPedidos } from './routes/pedidos';
import { rutasMiPanel } from './routes/mi-panel';
import { rutasSesionEquipo } from './routes/panel/sesion';
import { rutasSalud, type Comprobaciones } from './routes/salud';

export interface Opciones {
  comprobaciones: Comprobaciones;
  /** Sin base (solo en pruebas de salud) se montan únicamente /v1/health y /v1/ready. */
  db?: Kysely<Database>;
  mfaKey?: Buffer;
  portalUrl?: string;
  avisosEnConsola?: boolean;
  /** Versión vigente de los términos que se aceptan al reservar. */
  terminosVersion?: string;
  /** Con Redis el límite de peticiones se comparte entre procesos; sin él vive en memoria. */
  redis?: Redis;
  /** Peticiones por minuto y dirección en general, y en las rutas de acceso. */
  limites?: { general: number; acceso: number; cotizar?: number };
  /** Detrás de Caddy y del túnel: confiar en X-Forwarded-For para saber la IP real. */
  trustProxy?: boolean;
  logger?: boolean;
  /** Almacén de los archivos de los spots (MinIO). Sin él no se montan las rutas de anuncios. */
  almacen?: Almacen;
  /** Formatos de spot aceptados (config/spots.yaml). */
  formatosSpot?: string[];
}

/** Términos en borrador hasta que Invermedia entregue el contrato modelo (pregunta abierta 5). */
export const TERMINOS_POR_DEFECTO = '2026-11-borrador';

/** Arma el servidor sin abrir el puerto, para que las pruebas lo usen con `inject`. */
export async function buildApp(op: Opciones): Promise<FastifyInstance> {
  const app = Fastify({ logger: op.logger ?? false, trustProxy: op.trustProxy ?? false, bodyLimit: 64 * 1024 });
  manejarErrores(app);
  await app.register(helmet);
  const limites = op.limites ?? { general: 300, acceso: 10 };
  await app.register(multipart);
  await app.register(rateLimit, { max: limites.general, timeWindow: '1 minute', ...(op.redis && { redis: op.redis }) });

  await rutasSalud(app, op.comprobaciones);
  if (op.db) {
    if (!op.mfaKey || op.mfaKey.length !== 32) throw new Error('MFA_KEY debe tener 32 bytes');
    await rutasCuentas(app, {
      db: op.db,
      portalUrl: op.portalUrl ?? 'http://localhost:3100',
      avisosEnConsola: op.avisosEnConsola ?? false,
      limiteAcceso: limites.acceso,
    });
    await rutasSesionEquipo(app, { db: op.db, mfaKey: op.mfaKey, limiteAcceso: limites.acceso });
    await rutasCatalogo(app, op.db);
    await rutasPanelCatalogo(app, op.db);
    await rutasCotizaciones(app, { db: op.db, terminosVersion: op.terminosVersion ?? TERMINOS_POR_DEFECTO, limiteCotizar: limites.cotizar ?? 30 });
    await rutasPedidos(app, op.db);
    await rutasMiPanel(app, op.db, { limiteAcceso: limites.acceso });
    if (op.almacen) await rutasAnuncios(app, { db: op.db, almacen: op.almacen, formatos: op.formatosSpot ?? ['mp4', 'mp3', 'wav'] });
    if (op.almacen) await rutasCertificados(app, { db: op.db, almacen: op.almacen });
    await rutasPanelVentas(app, op.db);
  }
  return app;
}
