import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { listarEmisoras, parrillaDeEmisora, tarifarioVigente } from '@sp/catalogo';
import { duracionesDisponibles } from '@sp/pricing';
import type { Database } from '@sp/db';
import { ConsultaParrilla, type Emisora, type Parrilla } from '@sp/schemas';
import { HttpError, validar } from '../plugins/errores';

/** El catálogo es público: cualquiera ve emisoras y parrilla antes de crear cuenta. Se puede guardar un minuto en caché. */
export async function rutasCatalogo(app: FastifyInstance, db: Kysely<Database>): Promise<void> {
  const cache = 'public, max-age=60';

  app.get('/v1/emisoras', async (_req, reply): Promise<Emisora[]> => {
    reply.header('cache-control', cache);
    return listarEmisoras(db);
  });

  app.get('/v1/parrilla', async (req, reply): Promise<Parrilla> => {
    const { emisora } = validar(ConsultaParrilla, req.query);
    const p = await parrillaDeEmisora(db, emisora, { soloActivas: true });
    if (!p) throw new HttpError(404, 'emisora_no_existe', 'No encontramos esa emisora.');
    reply.header('cache-control', cache);
    return p;
  });

  /**
   * El tarifario vigente, para que el portal muestre el precio mientras se elige. Es público como cualquier lista de
   * precios. El precio que vale es el que calcula POST /v1/cotizaciones y queda guardado en la cotización.
   */
  app.get('/v1/tarifario', async (_req, reply) => {
    const t = await tarifarioVigente(db);
    if (!t) throw new HttpError(404, 'sin_tarifario', 'Todavía no hay tarifario publicado.');
    reply.header('cache-control', cache);
    return { ...t, duraciones: duracionesDisponibles(t) };
  });
}
