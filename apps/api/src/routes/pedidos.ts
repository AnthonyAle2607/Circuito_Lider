import type { FastifyInstance } from 'fastify';
import type { Kysely, Transaction } from 'kysely';
import { registrar } from '@sp/audit';
import { pedido as fsmPedido } from '@sp/core-fsm';
import { withTenant, type Database } from '@sp/db';
import { devolverCupos } from '@sp/inventory';
import type { Pedido, ResumenPedido } from '@sp/schemas';
import { exigirAnunciante } from '../auth/sesiones';
import { HttpError } from '../plugins/errores';
import { pagosDe } from './pagos/comun';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noExiste = () => new HttpError(404, 'pedido_no_existe', 'No encontramos ese pedido.');

/** Un pedido con sus reservas. Corre dentro de withTenant: la RLS solo deja ver los del anunciante. */
export async function leerPedido(t: Transaction<Database>, id: string): Promise<Pedido | null> {
  const p = await t.selectFrom('pedidos').selectAll().where('id', '=', id).executeTakeFirst();
  if (!p) return null;
  const reservas = await t
    .selectFrom('reservas')
    .select(['franja_id', 'fecha', 'segundos', 'estado'])
    .where('pedido_id', '=', id)
    .orderBy('fecha')
    .execute();
  return {
    id: p.id,
    estado: p.estado,
    cotizacionId: p.cotizacion_id,
    moneda: p.moneda,
    totalCentimos: p.total_centimos,
    reservaVenceAt: p.reserva_vence_at.toISOString(),
    anuncioId: p.anuncio_id ?? null,
    creadoAt: p.creado_at.toISOString(),
    reservas: reservas.map((r) => ({ franjaId: r.franja_id, fecha: r.fecha, segundos: r.segundos, estado: r.estado })),
    pagos: await pagosDe(t, id),
  };
}

export async function rutasPedidos(app: FastifyInstance, db: Kysely<Database>): Promise<void> {
  const acceso = { preHandler: exigirAnunciante(db) };
  const anunciante = (req: { principal?: unknown }) => {
    const p = req.principal as { tipo: string; anuncianteId: string; usuarioId: string } | undefined;
    if (p?.tipo !== 'anunciante') throw new HttpError(401, 'no_autorizado', 'Inicia sesión para continuar.');
    return p;
  };

  app.get('/v1/pedidos', acceso, async (req): Promise<ResumenPedido[]> => {
    const p = anunciante(req);
    return withTenant(db, p.anuncianteId, async (t) => {
      const filas = await t
        .selectFrom('pedidos as p')
        .leftJoin('reservas as r', 'r.pedido_id', 'p.id')
        .select((eb) => [
          'p.id',
          'p.estado',
          'p.cotizacion_id',
          'p.moneda',
          'p.total_centimos',
          'p.reserva_vence_at',
          'p.creado_at',
          eb.fn.count<number>('r.id').as('emisiones'),
        ])
        .groupBy('p.id')
        .orderBy('p.creado_at', 'desc')
        .limit(100)
        .execute();
      return filas.map((f) => ({
        id: f.id,
        estado: f.estado,
        cotizacionId: f.cotizacion_id,
        moneda: f.moneda,
        totalCentimos: f.total_centimos,
        reservaVenceAt: f.reserva_vence_at.toISOString(),
        creadoAt: f.creado_at.toISOString(),
        emisiones: Number(f.emisiones),
      }));
    });
  });

  app.get<{ Params: { id: string } }>('/v1/pedidos/:id', acceso, async (req): Promise<Pedido> => {
    const p = anunciante(req);
    if (!UUID.test(req.params.id)) throw noExiste();
    const pedido = await withTenant(db, p.anuncianteId, (t) => leerPedido(t, req.params.id));
    if (!pedido) throw noExiste();
    return pedido;
  });

  /** Cancela un pedido aún sin pagar y devuelve sus espacios al inventario. */
  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/cancelar', acceso, async (req): Promise<Pedido> => {
    const p = anunciante(req);
    if (!UUID.test(req.params.id)) throw noExiste();
    return withTenant(db, p.anuncianteId, async (t) => {
      const ped = await t.selectFrom('pedidos').select(['id', 'estado']).where('id', '=', req.params.id).forUpdate().executeTakeFirst();
      if (!ped) throw noExiste();
      if (!fsmPedido.puede(ped.estado, 'cancelar')) {
        throw new HttpError(409, 'no_cancelable', ped.estado === 'pagado' ? 'Un pedido pagado no se cancela desde aquí: escríbenos.' : 'Este pedido ya no está activo.');
      }
      const reservas = await t
        .selectFrom('reservas')
        .select(['franja_id', 'fecha', 'segundos'])
        .where('pedido_id', '=', ped.id)
        .where('estado', '=', 'retenida')
        .execute();
      await devolverCupos(t, reservas.map((r) => ({ franjaId: r.franja_id, fecha: r.fecha, segundos: r.segundos })));
      await t.updateTable('reservas').set({ estado: 'liberada', liberada_at: new Date() }).where('pedido_id', '=', ped.id).where('estado', '=', 'retenida').execute();
      await t.updateTable('pedidos').set({ estado: fsmPedido.siguiente(ped.estado, 'cancelar'), actualizado_at: new Date() }).where('id', '=', ped.id).execute();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'pedido.cancelado',
        entidad: 'pedido',
        entidadId: ped.id,
        ip: req.ip,
      });
      await t.insertInto('outbox').values({ anunciante_id: p.anuncianteId, tipo: 'pedido.cancelado', datos: JSON.stringify({ pedido_id: ped.id }) }).execute();
      return (await leerPedido(t, ped.id))!;
    });
  });
}
