import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { listarEmisoras, parrillaDeEmisora } from '@sp/catalogo';
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
}
