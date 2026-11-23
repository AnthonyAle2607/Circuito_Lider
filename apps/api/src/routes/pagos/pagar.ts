import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { withTenant, type Database } from '@sp/db';
import type { Pasarela } from '@sp/payments';
import type { Pago, SesionDePago } from '@sp/schemas';
import { contexto, exigirAnunciante } from '../../auth/sesiones';
import { HttpError } from '../../plugins/errores';
import { UUID, aPago, pedidoNoExiste, pedidoPorPagar } from './comun';

/** Una sesión de pago dura como máximo esto (y nunca más que la reserva del pedido). */
const SESION_MS = 30 * 60_000;
/** Una sesión que vence en menos de esto no se reutiliza: se abre otra. */
const MARGEN_MS = 2 * 60_000;

type Anunciante = { tipo: 'anunciante'; anuncianteId: string; usuarioId: string };

/**
 * POST /v1/pedidos/:id/pagar: abre (o reutiliza) una sesión en la pasarela y devuelve la página alojada a la que va el
 * cliente. El pago se crea primero en la base y luego se pide la sesión, para no llamar a la pasarela con una
 * transacción abierta. Confirmar el pago es cosa del aviso firmado o de la conciliación, nunca de esta ruta.
 * GET /v1/pagos: los pagos del anunciante. GET /v1/pagos/:id: uno (para la página de vuelta).
 */
export function rutaPagar(app: FastifyInstance, op: { db: Kysely<Database>; pasarela: Pasarela; portalUrl: string }): void {
  const { db, pasarela } = op;
  const acceso = { preHandler: exigirAnunciante(db) };

  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/pagar', acceso, async (req): Promise<SesionDePago> => {
    const p = req.principal as Anunciante;
    if (!UUID.test(req.params.id)) throw pedidoNoExiste();
    const pedidoId = req.params.id;

    const previo = await withTenant(db, p.anuncianteId, async (t) => {
      const ped = await pedidoPorPagar(t, pedidoId);
      const abierta = await t
        .selectFrom('pagos')
        .select(['id', 'url_pago', 'vence_at'])
        .where('pedido_id', '=', pedidoId)
        .where('metodo', '=', 'pasarela')
        .where('estado', '=', 'pendiente')
        .where('url_pago', 'is not', null)
        .where('vence_at', '>', new Date(Date.now() + MARGEN_MS))
        .orderBy('creado_at', 'desc')
        .executeTakeFirst();
      if (abierta) return { reutilizar: abierta };
      const venceAt = new Date(Math.min(ped.reserva_vence_at.getTime(), Date.now() + SESION_MS));
      const pago = await t
        .insertInto('pagos')
        .values({ anunciante_id: p.anuncianteId, pedido_id: pedidoId, usuario_id: p.usuarioId, metodo: 'pasarela', proveedor: pasarela.nombre, referencia_externa: null, monto_centimos: ped.total_centimos, moneda: ped.moneda, url_pago: null, vence_at: venceAt, comprobante_clave: null, comprobante_nombre: null })
        .returning('id')
        .executeTakeFirstOrThrow();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'pago.iniciado',
        entidad: 'pago',
        entidadId: pago.id,
        datos: { pedido_id: pedidoId, proveedor: pasarela.nombre, monto_centimos: ped.total_centimos, moneda: ped.moneda },
        ip: contexto(req).ip,
      });
      return { nuevo: { id: pago.id, venceAt, monto: ped.total_centimos, moneda: ped.moneda } };
    });

    if (previo.reutilizar) return { pagoId: previo.reutilizar.id, url: previo.reutilizar.url_pago!, venceAt: previo.reutilizar.vence_at!.toISOString() };

    const n = previo.nuevo!;
    const volver = `${op.portalUrl}/cuenta/pedidos/${pedidoId}`;
    let sesion;
    try {
      sesion = await pasarela.crearSesion({
        pagoId: n.id,
        montoCentimos: n.monto,
        moneda: n.moneda,
        descripcion: `Pauta de radio · pedido ${pedidoId.slice(0, 8)}`,
        urlExito: `${volver}?pago=ok`,
        urlCancelar: `${volver}?pago=cancelado`,
        venceAt: n.venceAt,
      });
    } catch (e) {
      req.log.error({ err: e, pago: n.id }, 'la pasarela no abrió la sesión');
      throw new HttpError(502, 'pasarela_no_disponible', 'La pasarela de pago no respondió. Intenta de nuevo en unos minutos.');
    }
    await withTenant(db, p.anuncianteId, (t) =>
      t.updateTable('pagos').set({ referencia_externa: sesion.referencia, url_pago: sesion.url, vence_at: sesion.venceAt, actualizado_at: new Date() }).where('id', '=', n.id).execute(),
    );
    return { pagoId: n.id, url: sesion.url, venceAt: sesion.venceAt.toISOString() };
  });

  app.get('/v1/pagos', acceso, async (req): Promise<Pago[]> => {
    const p = req.principal as Anunciante;
    const filas = await withTenant(db, p.anuncianteId, (t) => t.selectFrom('pagos').selectAll().orderBy('creado_at', 'desc').limit(200).execute());
    return filas.map(aPago);
  });

  app.get<{ Params: { id: string } }>('/v1/pagos/:id', acceso, async (req): Promise<Pago> => {
    const p = req.principal as Anunciante;
    const f = UUID.test(req.params.id) ? await withTenant(db, p.anuncianteId, (t) => t.selectFrom('pagos').selectAll().where('id', '=', req.params.id).executeTakeFirst()) : undefined;
    if (!f) throw new HttpError(404, 'pago_no_existe', 'No encontramos ese pago.');
    return aPago(f);
  });
}
