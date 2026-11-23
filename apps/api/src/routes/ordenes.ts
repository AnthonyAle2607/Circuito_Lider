import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@sp/db';
import { ConfirmarOrden, EstadoOrden, type OrdenDePauta } from '@sp/schemas';
import type { Almacen } from '@sp/spots';
import { exigirEquipo } from '../auth/sesiones';
import { HttpError, validar } from '../plugins/errores';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4' };
const noExiste = () => new HttpError(404, 'orden_no_existe', 'No encontramos esa orden.');

/**
 * Órdenes de pauta para el equipo de programación (RF-20, RF-21): ver lo que hay que cargar en cada emisora, bajar el
 * spot y confirmar que quedó cargado. Atraviesan anunciantes, así que pasan por funciones de la base (0014).
 */
export function rutasOrdenes(app: FastifyInstance, op: { db: Kysely<Database>; almacen?: Almacen }): void {
  const programacion = { preHandler: exigirEquipo(op.db, ['programacion', 'gerencia']) };

  app.get<{ Querystring: { estado?: string } }>('/v1/panel/ordenes', programacion, async (req): Promise<OrdenDePauta[]> => {
    const estado = EstadoOrden.parse(req.query.estado ?? 'pendiente');
    const r = await sql<Record<string, unknown>>`select * from ordenes_para_operador(${estado}::estado_orden)`.execute(op.db);
    return r.rows.map((f) => ({
      id: f.id as string,
      estado: f.estado as OrdenDePauta['estado'],
      emisora: f.emisora as string,
      ciudad: f.ciudad as string,
      frecuencia: f.frecuencia as string,
      empresa: f.empresa as string,
      anuncio: f.anuncio as string,
      formato: f.formato as string,
      duracionMs: (f.duracion_ms as number | null) ?? null,
      pedidoId: f.pedido_id as string,
      creadaAt: new Date(f.creada_at as string).toISOString(),
      cargadaAt: f.cargada_at ? new Date(f.cargada_at as string).toISOString() : null,
      nota: (f.nota as string | null) ?? null,
      lineas: f.lineas as OrdenDePauta['lineas'],
    }));
  });

  app.get<{ Params: { id: string } }>('/v1/panel/ordenes/:id/spot', programacion, async (req, reply) => {
    if (!op.almacen) throw new HttpError(503, 'sin_almacen', 'El almacén de archivos no está configurado.');
    if (!UUID.test(req.params.id)) throw noExiste();
    const r = await sql<{ archivo_clave: string; formato: string; archivo_nombre: string }>`select * from spot_de_orden(${req.params.id}::uuid)`.execute(op.db);
    const f = r.rows[0];
    if (!f) throw noExiste();
    const nombre = f.archivo_nombre.replace(/[^\w.\- ]/g, '_');
    return reply
      .header('content-type', TIPOS[f.formato] ?? 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${nombre}"`)
      .header('cache-control', 'private, no-store')
      .send(await op.almacen.leer(f.archivo_clave));
  });

  app.post<{ Params: { id: string } }>('/v1/panel/ordenes/:id/cargada', programacion, async (req) => {
    if (!UUID.test(req.params.id)) throw noExiste();
    const d = validar(ConfirmarOrden, req.body ?? {});
    const equipoId = (req.principal as { equipoId?: string } | undefined)?.equipoId ?? null;
    const r = await sql<{ r: string }>`select confirmar_orden(${req.params.id}::uuid, ${equipoId}::uuid, ${d.nota || null}) as r`.execute(op.db);
    const resultado = r.rows[0]!.r;
    if (resultado === 'no_existe') throw noExiste();
    if (resultado === 'anulada') throw new HttpError(409, 'orden_anulada', 'Esta orden se anuló: el cliente cambió el anuncio. Revisa la orden nueva.');
    if (resultado === 'ya_cargada') throw new HttpError(409, 'ya_cargada', 'Esta orden ya estaba marcada como cargada.');
    return { resultado };
  });
}
