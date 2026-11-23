import type { Selectable, Transaction } from 'kysely';
import type { Database, PagosTabla } from '@sp/db';
import type { Pago } from '@sp/schemas';
import { HttpError } from '../../plugins/errores';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pedidoNoExiste = () => new HttpError(404, 'pedido_no_existe', 'No encontramos ese pedido.');

type FilaPago = Selectable<PagosTabla>;

export function aPago(f: FilaPago): Pago {
  return {
    id: f.id,
    pedidoId: f.pedido_id,
    metodo: f.metodo,
    estado: f.estado,
    montoCentimos: f.monto_centimos,
    moneda: f.moneda,
    referencia: f.referencia_externa,
    motivo: f.motivo,
    creadoAt: f.creado_at.toISOString(),
    confirmadoAt: f.confirmado_at ? f.confirmado_at.toISOString() : null,
  };
}

/** Los pagos de un pedido, el más reciente primero. Corre dentro de withTenant. */
export async function pagosDe(t: Transaction<Database>, pedidoId: string): Promise<Pago[]> {
  const filas = await t.selectFrom('pagos').selectAll().where('pedido_id', '=', pedidoId).orderBy('creado_at', 'desc').execute();
  return filas.map(aPago);
}

/**
 * El pedido que se quiere pagar, bloqueado: debe ser del anunciante (RLS), seguir reservado y no tener ya un pago
 * en curso por el otro método. Devuelve lo necesario para crear el pago.
 */
export async function pedidoPorPagar(t: Transaction<Database>, id: string) {
  const p = await t.selectFrom('pedidos').select(['id', 'estado', 'total_centimos', 'moneda', 'reserva_vence_at']).where('id', '=', id).forUpdate().executeTakeFirst();
  if (!p) throw pedidoNoExiste();
  if (p.estado === 'pagado') throw new HttpError(409, 'ya_pagado', 'Este pedido ya está pagado.');
  if (p.estado !== 'reservado') throw new HttpError(409, 'pedido_no_activo', 'Este pedido ya no está activo. Cotiza de nuevo para reservar.');
  if (p.reserva_vence_at < new Date()) throw new HttpError(410, 'reserva_vencida', 'La reserva de este pedido venció. Cotiza de nuevo.');
  const enRevision = await t.selectFrom('pagos').select('id').where('pedido_id', '=', id).where('metodo', '=', 'transferencia').where('estado', '=', 'pendiente').executeTakeFirst();
  if (enRevision) throw new HttpError(409, 'transferencia_en_revision', 'Ya enviaste un comprobante de transferencia: lo estamos revisando.');
  return p;
}
