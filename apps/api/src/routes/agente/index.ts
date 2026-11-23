/**
 * Agente vendedor (PT-5b): el chat con Toño para los visitantes (SSE) y la bandeja de conversaciones para ventas.
 * El bucle y las herramientas están en @sp/sales-agent; aquí se guardan las conversaciones y se aplican los topes.
 */
import type { FastifyInstance } from 'fastify';
import { rutaChat, type OpcionesChat } from './chat';
import { rutaPanelAgente } from './panel';

export type { OpcionesChat as OpcionesAgente } from './chat';

export async function rutasAgente(app: FastifyInstance, op: OpcionesChat): Promise<void> {
  rutaChat(app, op);
  rutaPanelAgente(app, op.db);
}
