import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { tarifarioPorId } from '@sp/catalogo';
import { cotizacion as fsmCotizacion } from '@sp/core-fsm';
import { withTenant, type Database } from '@sp/db';
import { SinCupo, tomarCupos } from '@sp/inventory';
import { Reservar, type Pedido } from '@sp/schemas';
import { contexto, exigirAnunciante } from '../../auth/sesiones';
import { HttpError, validar } from '../../plugins/errores';
import { leerPedido } from '../pedidos';
import { UUID } from './lectura';

/**
 * POST /v1/cotizaciones/:id/reservar: el anunciante (con el correo verificado) acepta los términos, se crea el pedido
 * y se retienen los espacios hasta el vencimiento. Todo en una transacción: si un solo espacio ya no cabe, no se
 * reserva nada.
 */
export function rutaReservar(app: FastifyInstance, db: Kysely<Database>, terminosVersion: string): void {
  app.post<{ Params: { id: string } }>('/v1/cotizaciones/:id/reservar', { preHandler: exigirAnunciante(db) }, async (req, reply): Promise<Pedido> => {
    const p = req.principal;
    if (p?.tipo !== 'anunciante') throw new HttpError(401, 'no_autorizado', 'Inicia sesión para continuar.');
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'cotizacion_no_existe', 'No encontramos esa cotización.');
    const d = validar(Reservar, req.body);
    if (d.terminosVersion !== terminosVersion) {
      throw new HttpError(409, 'terminos_cambiaron', 'Los términos cambiaron. Léelos de nuevo y acéptalos para reservar.');
    }
    const ctx = contexto(req);

    const pedidoId = await withTenant(db, p.anuncianteId, async (t) => {
      const u = await t.selectFrom('usuarios').select('correo_verificado_at').where('id', '=', p.usuarioId).executeTakeFirstOrThrow();
      if (!u.correo_verificado_at) throw new HttpError(403, 'correo_sin_verificar', 'Confirma tu correo antes de reservar.');

      const c = await t.selectFrom('cotizaciones').selectAll().where('id', '=', req.params.id).forUpdate().executeTakeFirst();
      if (!c) throw new HttpError(404, 'cotizacion_no_existe', 'No encontramos esa cotización.');
      if (c.estado === 'en_aprobacion') throw new HttpError(409, 'pendiente_aprobacion', 'Esta cotización espera la aprobación de ventas. Te avisaremos.');
      if (c.estado === 'reservada') throw new HttpError(409, 'ya_reservada', 'Esta cotización ya se reservó.');
      if (!fsmCotizacion.puede(c.estado, 'reservar')) throw new HttpError(409, 'cotizacion_no_reservable', 'Esta cotización ya no se puede reservar.');
      if (c.vence_at < new Date()) throw new HttpError(410, 'cotizacion_vencida', 'El precio de esta cotización venció. Pide una nueva.');

      const tarifario = await tarifarioPorId(t, c.tarifario_id);
      const lineas = await t.selectFrom('cotizacion_lineas').select(['franja_id', 'fecha']).where('cotizacion_id', '=', c.id).execute();
      try {
        await tomarCupos(t, lineas.map((l) => ({ franjaId: l.franja_id, fecha: l.fecha, segundos: c.duracion_segundos })));
      } catch (err) {
        if (err instanceof SinCupo) {
          throw new HttpError(409, 'sin_cupo', `Mientras decidías se ocupó el espacio en ${err.faltantes.length} de las emisiones. Cotiza de nuevo.`, {
            faltantes: err.faltantes,
          });
        }
        throw err;
      }

      const ahora = new Date();
      const pedido = await t
        .insertInto('pedidos')
        .values({
          anunciante_id: p.anuncianteId,
          cotizacion_id: c.id,
          usuario_id: p.usuarioId,
          moneda: c.moneda,
          total_centimos: c.total_centimos,
          reserva_vence_at: new Date(ahora.getTime() + tarifario!.reservaHoras * 3_600_000),
          terminos_version: d.terminosVersion,
          terminos_aceptados_at: ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await t
        .insertInto('reservas')
        .values(lineas.map((l) => ({ anunciante_id: p.anuncianteId, pedido_id: pedido.id, franja_id: l.franja_id, fecha: l.fecha, segundos: c.duracion_segundos })))
        .execute();
      await t.updateTable('cotizaciones').set({ estado: fsmCotizacion.siguiente(c.estado, 'reservar') }).where('id', '=', c.id).execute();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'pedido.reservado',
        entidad: 'pedido',
        entidadId: pedido.id,
        datos: { cotizacion_id: c.id, total_centimos: c.total_centimos, moneda: c.moneda, emisiones: lineas.length, terminos_version: d.terminosVersion },
        ip: ctx.ip,
      });
      await t
        .insertInto('outbox')
        .values({ anunciante_id: p.anuncianteId, tipo: 'pedido.reservado', datos: JSON.stringify({ pedido_id: pedido.id }) })
        .execute();
      return pedido.id;
    });

    reply.code(201);
    return (await withTenant(db, p.anuncianteId, (t) => leerPedido(t, pedidoId)))!;
  });
}
