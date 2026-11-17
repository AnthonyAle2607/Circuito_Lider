import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import { rutasSalud, type Comprobaciones } from './routes/salud';

export interface Opciones {
  comprobaciones: Comprobaciones;
  logger?: boolean;
}

/** Arma el servidor sin abrir el puerto, para que las pruebas lo usen con `inject`. */
export async function buildApp(op: Opciones): Promise<FastifyInstance> {
  const app = Fastify({ logger: op.logger ?? false });
  await app.register(helmet);
  await rutasSalud(app, op.comprobaciones);
  return app;
}
