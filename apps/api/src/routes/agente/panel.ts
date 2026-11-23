import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import type { Database } from '@sp/db';
import { exigirEquipo } from '../../auth/sesiones';
import { HttpError } from '../../plugins/errores';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto visible de un mensaje guardado: lo que se dijeron cliente y agente, y qué herramientas usó. */
type Linea = { quien: 'cliente' | 'agente' | 'herramienta'; texto: string };
function visible(rol: string, contenido: unknown): Linea[] {
  if (rol === 'system' || !Array.isArray(contenido)) return [];
  return contenido.flatMap((b: { type?: string; text?: string; name?: string }): Linea[] => {
    if (b.type === 'text' && b.text) return [{ quien: rol === 'user' ? 'cliente' : 'agente', texto: b.text }];
    if (b.type === 'tool_use' && b.name) return [{ quien: 'herramienta', texto: b.name }];
    return [];
  });
}

/**
 * Bandeja del agente para ventas y gerencia: conversaciones recientes (las traspasadas primero), cada una con su
 * transcripción, y el indicador de la meta: pedidos pagados que salieron de una cotización del agente sin traspaso.
 */
export function rutaPanelAgente(app: FastifyInstance, db: Kysely<Database>): void {
  const ventas = { preHandler: exigirEquipo(db, ['ventas', 'gerencia']) };

  app.get('/v1/panel/agente/conversaciones', ventas, async () => {
    const filas = await db
      .selectFrom('conversaciones')
      .select(['id', 'estado', 'prospecto', 'cotizaciones', 'traspaso_motivo', 'traspaso_resumen', 'traspasada_at', 'turnos', 'costo_micro_usd', 'creado_at', 'actualizado_at'])
      .orderBy(sql`estado = 'traspasada'`, 'desc')
      .orderBy('actualizado_at', 'desc')
      .limit(100)
      .execute();
    // Meta del 80 %: pagados con cotización del agente y conversación sin traspaso ÷ pagados.
    const [m] = (
      await sql<{ pagados: string; del_agente: string }>`
        select count(*) as pagados,
               count(*) filter (where c.conversacion_id is not null and v.estado <> 'traspasada') as del_agente
          from pedidos p join cotizaciones c on c.id = p.cotizacion_id left join conversaciones v on v.id = c.conversacion_id
         where p.estado = 'pagado'`.execute(db)
    ).rows;
    return {
      meta: { pedidosPagados: Number(m?.pagados ?? 0), pagadosSinIntervencion: Number(m?.del_agente ?? 0) },
      conversaciones: filas.map((f) => ({
        id: f.id,
        estado: f.estado,
        prospecto: f.prospecto,
        cotizaciones: f.cotizaciones.length,
        traspaso: f.traspaso_motivo ? { motivo: f.traspaso_motivo, resumen: f.traspaso_resumen, at: f.traspasada_at?.toISOString() ?? null } : null,
        turnos: f.turnos,
        costoUsd: Number(f.costo_micro_usd) / 1_000_000,
        creadoAt: f.creado_at.toISOString(),
        actualizadoAt: new Date(f.actualizado_at as unknown as string).toISOString(),
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/v1/panel/agente/conversaciones/:id', ventas, async (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'conversacion_no_existe', 'No encontramos esa conversación.');
    const c = await db.selectFrom('conversaciones').select(['id', 'estado', 'prospecto', 'traspaso_motivo', 'traspaso_resumen']).where('id', '=', req.params.id).executeTakeFirst();
    if (!c) throw new HttpError(404, 'conversacion_no_existe', 'No encontramos esa conversación.');
    const mensajes = await db.selectFrom('conversacion_mensajes').select(['rol', 'contenido', 'creado_at']).where('conversacion_id', '=', c.id).orderBy('orden').execute();
    return { ...c, mensajes: mensajes.flatMap((m) => visible(m.rol, m.contenido).map((x) => ({ ...x, at: m.creado_at.toISOString() }))) };
  });

  /** Ventas atendió la conversación por su cuenta (correo o WhatsApp): queda cerrada. */
  app.post<{ Params: { id: string } }>('/v1/panel/agente/conversaciones/:id/cerrar', ventas, async (req, reply) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'conversacion_no_existe', 'No encontramos esa conversación.');
    const equipoId = (req.principal as { equipoId?: string } | undefined)?.equipoId;
    const r = await db.transaction().execute(async (t) => {
      const u = await t.updateTable('conversaciones').set({ estado: 'cerrada', actualizado_at: new Date() }).where('id', '=', req.params.id).where('estado', '<>', 'cerrada').executeTakeFirst();
      if (u.numUpdatedRows > 0n) await registrar(t, { actor: { tipo: 'equipo', id: equipoId }, accion: 'conversacion.cerrada', entidad: 'conversacion', entidadId: req.params.id });
      return u.numUpdatedRows;
    });
    if (r === 0n) throw new HttpError(409, 'ya_cerrada', 'Esta conversación ya estaba cerrada.');
    return reply.code(204).send();
  });
}
