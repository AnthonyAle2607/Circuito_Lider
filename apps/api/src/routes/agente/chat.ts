import type Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '@sp/db';
import { hoyEnCaracas, sumarDias } from '@sp/inventory';
import { atender, type ConfigAgente, type Evento } from '@sp/sales-agent';
import { dominioDelAgente } from '../../agente/dominio';
import { buscarConversacion, crearConversacion, gastoDeHoy, guardarTurno, historial } from '../../agente/conversaciones';
import { resolverSesion } from '../../auth/sesiones';
import { HttpError, validar } from '../../plugins/errores';

export interface OpcionesChat {
  db: Kysely<Database>;
  portalUrl: string;
  /** Sin cliente (no hay credenciales de la API de Claude) el agente queda apagado y el portal usa sus respuestas fijas. */
  agente?: { cliente: Anthropic; config: ConfigAgente };
}

const MSJ_TOPE = 'Gracias por escribirnos. Para seguir con tu pauta te va a contactar una persona del equipo de ventas.';
const MSJ_ERROR = 'Tuve un problema para responderte. Intenta de nuevo en un momento.';

/** Lo que cambia en cada turno y no puede ir en las instrucciones (que son fijas para la caché). */
function contexto(conSesion: boolean): string {
  const ahora = new Date(Date.now() - 4 * 3600e3);
  const hoy = hoyEnCaracas();
  const dia = ahora.toLocaleDateString('es-VE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hora = ahora.toISOString().slice(11, 16);
  return `Hoy es ${dia} (${hoy}), ${hora} en Venezuela. Las fechas cotizables empiezan mañana, ${sumarDias(hoy, 1)}. ${
    conSesion ? 'El cliente inició sesión en su cuenta.' : 'El cliente no ha iniciado sesión; el enlace de la cotización lo guía para crear su cuenta y reservar.'
  }`;
}

/**
 * POST /v1/agente/mensajes: un mensaje del cliente a Toño. La respuesta llega en vivo como eventos SSE: `inicio`
 * (token de la conversación), `texto` (fragmentos), `herramienta` (qué está consultando), `fin` (estado). Los errores
 * previos a empezar (mensaje vacío, conversación desconocida, agente apagado) son JSON normales.
 */
export function rutaChat(app: FastifyInstance, op: OpcionesChat): void {
  const Mensaje = z.object({ token: z.string().min(20).max(100).optional(), texto: z.string().trim().min(1) });

  app.post('/v1/agente/mensajes', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!op.agente) throw new HttpError(503, 'agente_apagado', 'El asistente no está disponible en este momento.');
    const { cliente, config } = op.agente;
    const d = validar(Mensaje, req.body);
    if (d.texto.length > config.largoMensaje) throw new HttpError(400, 'mensaje_largo', `Escribe un mensaje de hasta ${config.largoMensaje} caracteres.`);

    const nueva = d.token ? null : await crearConversacion(op.db, req.ip);
    const conv = nueva?.conversacion ?? (await buscarConversacion(op.db, d.token!));
    if (!conv) throw new HttpError(404, 'conversacion_no_existe', 'Esta conversación ya no existe. Empieza una nueva.');
    const principal = await resolverSesion(op.db, req);
    const cuenta = principal?.tipo === 'anunciante' ? { anuncianteId: principal.anuncianteId, usuarioId: principal.usuarioId } : null;

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const enviar = (evento: string, datos: unknown) => raw.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
    if (nueva) enviar('inicio', { token: nueva.token });

    try {
      if (conv.estado !== 'agente') {
        enviar('texto', { texto: 'Tu conversación ya está con el equipo de ventas; te escribirán pronto.' });
        enviar('fin', { estado: conv.estado });
        return;
      }
      // P9: topes de uso y de gasto antes de llamar al modelo.
      const sinPresupuesto =
        conv.turnos >= config.turnos || conv.costoMicroUsd >= config.topeConversacionMicroUsd || (await gastoDeHoy(op.db)) >= config.topeDiaMicroUsd;
      if (sinPresupuesto) {
        conv.efectos.traspaso ??= { motivo: 'Tope de uso del agente', resumen: d.texto.slice(0, 500) };
        await guardarTurno(op.db, conv, { nuevos: [], uso: { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 }, costoMicroUsd: 0, final: 'tope' }, cuenta);
        enviar('texto', { texto: MSJ_TOPE });
        enviar('fin', { estado: 'traspasada' });
        return;
      }
      const turno = await atender({
        cliente,
        dominio: dominioDelAgente(op.db, { portalUrl: op.portalUrl, conversacionId: conv.id, ip: req.ip }),
        historial: await historial(op.db, conv.id),
        texto: d.texto,
        contexto: contexto(Boolean(cuenta)),
        efectos: conv.efectos,
        topeMicroUsd: config.topeTurnoMicroUsd,
        emitir: (e: Evento) => enviar(e.tipo, e),
      });
      await guardarTurno(op.db, conv, turno, cuenta);
      req.log.info({ conversacion: conv.id, final: turno.final, costo: turno.costoMicroUsd, cache: turno.uso.cacheLectura }, 'turno del agente');
      enviar('fin', { estado: conv.efectos.traspaso ? 'traspasada' : 'agente' });
    } catch (e) {
      req.log.error({ err: e, conversacion: conv.id }, 'el agente no pudo responder');
      enviar('texto', { texto: MSJ_ERROR });
      enviar('fin', { estado: 'error' });
    } finally {
      raw.end();
    }
  });
}
