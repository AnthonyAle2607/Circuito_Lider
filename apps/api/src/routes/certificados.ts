import type { FastifyInstance } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import { registrar } from '@sp/audit';
import { withTenant, type Database } from '@sp/db';
import { AsignarAnuncio, type Certificado } from '@sp/schemas';
import type { Almacen } from '@sp/spots';
import { contexto, exigirAnunciante } from '../auth/sesiones';
import { HttpError, validar } from '../plugins/errores';
import { leerPedido } from './pedidos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noExiste = () => new HttpError(404, 'certificado_no_existe', 'No encontramos ese certificado.');

function consulta(t: Transaction<Database>) {
  return t
    .selectFrom('certificados as c')
    .innerJoin('anuncios as a', 'a.id', 'c.anuncio_id')
    .innerJoin('emisoras as e', 'e.id', 'c.emisora_id')
    .select([
      'c.id',
      'c.pedido_id',
      'c.emitido_at',
      'c.duracion_ms',
      'c.parecido',
      'c.clip_sha256',
      'c.creado_at',
      'a.id as anuncio_id',
      'a.nombre as anuncio_nombre',
      'e.nombre as emisora_nombre',
      'e.ciudad',
      'e.frecuencia',
    ]);
}

type Fila = Awaited<ReturnType<ReturnType<typeof consulta>['executeTakeFirstOrThrow']>>;
const aCertificado = (f: Fila): Certificado => ({
  id: f.id,
  pedidoId: f.pedido_id,
  anuncio: { id: f.anuncio_id, nombre: f.anuncio_nombre },
  emisora: { nombre: f.emisora_nombre, ciudad: f.ciudad, frecuencia: f.frecuencia },
  emitidoAt: f.emitido_at.toISOString(),
  duracionMs: f.duracion_ms,
  parecido: Number(f.parecido),
  sha256: Buffer.from(f.clip_sha256).toString('hex'),
  creadoAt: f.creado_at.toISOString(),
});

/**
 * PT-7. El cliente elige qué anuncio suena en cada pedido, y ve los certificados de cada emisión con su audio. Los
 * certificados los crea solo el trabajo de detección (función de la base); la API únicamente los lee.
 */
export async function rutasCertificados(app: FastifyInstance, op: { db: Kysely<Database>; almacen: Almacen }): Promise<void> {
  const { db, almacen } = op;
  const acceso = { preHandler: exigirAnunciante(db) };
  const quien = (req: { principal?: unknown }) => req.principal as { usuarioId: string; anuncianteId: string };

  app.put<{ Params: { id: string } }>('/v1/pedidos/:id/anuncio', acceso, async (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'pedido_no_existe', 'No encontramos ese pedido.');
    const p = quien(req);
    const d = validar(AsignarAnuncio, req.body);
    return withTenant(db, p.anuncianteId, async (t) => {
      const pedido = await t.selectFrom('pedidos').select(['id', 'estado']).where('id', '=', req.params.id).forUpdate().executeTakeFirst();
      if (!pedido) throw new HttpError(404, 'pedido_no_existe', 'No encontramos ese pedido.');
      if (pedido.estado !== 'reservado' && pedido.estado !== 'pagado') throw new HttpError(409, 'pedido_cerrado', 'Este pedido ya no está vigente.');
      // La RLS solo deja ver los anuncios de la propia cuenta: uno ajeno simplemente «no existe».
      const anuncio = await t.selectFrom('anuncios').select(['id', 'estado']).where('id', '=', d.anuncioId).executeTakeFirst();
      if (!anuncio) throw new HttpError(404, 'anuncio_no_existe', 'No encontramos ese anuncio.');
      if (anuncio.estado !== 'aprobado') throw new HttpError(409, 'anuncio_no_aprobado', 'Solo puede sonar un anuncio aprobado.');
      await t.updateTable('pedidos').set({ anuncio_id: anuncio.id }).where('id', '=', pedido.id).execute();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'pedido.anuncio_asignado',
        entidad: 'pedido',
        entidadId: pedido.id,
        datos: { anuncio_id: anuncio.id },
        ip: contexto(req).ip,
      });
      return leerPedido(t, pedido.id);
    });
  });

  app.get<{ Querystring: { pedido?: string } }>('/v1/certificados', acceso, async (req): Promise<Certificado[]> => {
    const p = quien(req);
    const pedido = req.query.pedido && UUID.test(req.query.pedido) ? req.query.pedido : null;
    const filas = await withTenant(db, p.anuncianteId, (t) => {
      let q = consulta(t).orderBy('c.emitido_at', 'desc').limit(500);
      if (pedido) q = q.where('c.pedido_id', '=', pedido);
      return q.execute();
    });
    return filas.map(aCertificado);
  });

  app.get<{ Params: { id: string } }>('/v1/certificados/:id', acceso, async (req): Promise<Certificado> => {
    if (!UUID.test(req.params.id)) throw noExiste();
    const f = await withTenant(db, quien(req).anuncianteId, (t) => consulta(t).where('c.id', '=', req.params.id).executeTakeFirst());
    if (!f) throw noExiste();
    return aCertificado(f);
  });

  app.get<{ Params: { id: string } }>('/v1/certificados/:id/audio', acceso, async (req, reply) => {
    if (!UUID.test(req.params.id)) throw noExiste();
    const f = await withTenant(db, quien(req).anuncianteId, (t) =>
      t.selectFrom('certificados').select(['clip_clave']).where('id', '=', req.params.id).executeTakeFirst(),
    );
    if (!f) throw noExiste();
    return reply
      .header('content-type', 'audio/mpeg')
      .header('cache-control', 'private, max-age=3600')
      .send(await almacen.leer(f.clip_clave));
  });
}
