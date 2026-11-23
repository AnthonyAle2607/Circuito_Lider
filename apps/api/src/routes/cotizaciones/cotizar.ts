import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@sp/db';
import { PedirCotizacion, type Cotizacion } from '@sp/schemas';
import { HttpError, validar } from '../../plugins/errores';
import { crearCotizacion } from './crear';
import { UUID, leerCotizacion } from './lectura';

/**
 * POST /v1/cotizaciones: cotiza sin cuenta (la lógica está en `crear.ts`, compartida con el agente vendedor).
 * GET /v1/cotizaciones/:id: la cotización guardada.
 */
export function rutaCotizar(app: FastifyInstance, db: Kysely<Database>, limite: number): void {
  app.post('/v1/cotizaciones', { config: { rateLimit: { max: limite, timeWindow: '1 minute' } } }, async (req, reply): Promise<Cotizacion> => {
    const d = validar(PedirCotizacion, req.body);
    const id = await crearCotizacion(db, d, { ip: req.ip });
    reply.code(201);
    return (await leerCotizacion(db, id))!;
  });

  app.get<{ Params: { id: string } }>('/v1/cotizaciones/:id', async (req): Promise<Cotizacion> => {
    const c = UUID.test(req.params.id) ? await leerCotizacion(db, req.params.id) : null;
    if (!c) throw new HttpError(404, 'cotizacion_no_existe', 'No encontramos esa cotización.');
    return c;
  });
}
