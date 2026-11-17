import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { NuevoTarifario, publicarTarifario, tarifarioVigente } from '@sp/catalogo';
import { cotizacion as fsmCotizacion } from '@sp/core-fsm';
import type { Database } from '@sp/db';
import { DecisionAprobacion } from '@sp/schemas';
import { exigirEquipo } from '../../auth/sesiones';
import { HttpError, validar } from '../../plugins/errores';
import { leerCotizacion } from '../cotizaciones';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ventas aprueba lo que pasa del umbral; gerencia publica tarifarios. */
export async function rutasPanelVentas(app: FastifyInstance, db: Kysely<Database>): Promise<void> {
  const ventas = { preHandler: exigirEquipo(db, ['ventas', 'gerencia']) };
  const gerencia = { preHandler: exigirEquipo(db, ['gerencia']) };
  const equipoId = (req: { principal?: { tipo: string; equipoId?: string } }) => req.principal?.equipoId;

  app.get('/v1/panel/aprobaciones', ventas, async () => {
    const filas = await db
      .selectFrom('cotizaciones')
      .select(['id', 'moneda', 'total_centimos', 'emisiones', 'duracion_segundos', 'creado_at', 'vence_at'])
      .where('estado', '=', 'en_aprobacion')
      .where('vence_at', '>', new Date())
      .orderBy('creado_at')
      .limit(200)
      .execute();
    return filas.map((f) => ({
      id: f.id,
      moneda: f.moneda,
      totalCentimos: f.total_centimos,
      emisiones: f.emisiones,
      duracionSegundos: f.duracion_segundos,
      creadoAt: f.creado_at.toISOString(),
      venceAt: f.vence_at.toISOString(),
    }));
  });

  app.post<{ Params: { id: string } }>('/v1/panel/aprobaciones/:id', ventas, async (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'cotizacion_no_existe', 'No encontramos esa cotización.');
    const d = validar(DecisionAprobacion, req.body);
    await db.transaction().execute(async (t) => {
      const c = await t.selectFrom('cotizaciones').select(['id', 'estado', 'vence_at']).where('id', '=', req.params.id).forUpdate().executeTakeFirst();
      if (!c) throw new HttpError(404, 'cotizacion_no_existe', 'No encontramos esa cotización.');
      if (!fsmCotizacion.puede(c.estado, d.decision)) throw new HttpError(409, 'ya_decidida', 'Esta cotización ya no espera aprobación.');
      if (c.vence_at < new Date()) throw new HttpError(410, 'cotizacion_vencida', 'La cotización venció; el cliente debe pedir una nueva.');
      await t
        .updateTable('cotizaciones')
        .set({ estado: fsmCotizacion.siguiente(c.estado, d.decision), decidido_por: equipoId(req) ?? null, decidido_at: new Date(), motivo_decision: d.motivo })
        .where('id', '=', c.id)
        .execute();
      await registrar(t, {
        actor: { tipo: 'equipo', id: equipoId(req) },
        accion: d.decision === 'aprobar' ? 'cotizacion.aprobada' : 'cotizacion.rechazada',
        entidad: 'cotizacion',
        entidadId: c.id,
        datos: { motivo: d.motivo },
        ip: req.ip,
      });
      await t.insertInto('outbox').values({ tipo: `cotizacion.${d.decision === 'aprobar' ? 'aprobada' : 'rechazada'}`, datos: JSON.stringify({ cotizacion_id: c.id }) }).execute();
    });
    return leerCotizacion(db, req.params.id);
  });

  app.get('/v1/panel/tarifario', ventas, async () => {
    const t = await tarifarioVigente(db);
    if (!t) throw new HttpError(404, 'sin_tarifario', 'Todavía no hay tarifario publicado.');
    return t;
  });

  /** Publica una versión nueva. Las cotizaciones hechas con la anterior conservan su precio (P4). */
  app.put('/v1/panel/tarifario', gerencia, async (req, reply) => {
    const d = validar(NuevoTarifario, req.body);
    const r = await db.transaction().execute(async (t) => {
      const v = await publicarTarifario(t, d, { creadoPor: equipoId(req) ?? null });
      await registrar(t, {
        actor: { tipo: 'equipo', id: equipoId(req) },
        accion: 'tarifario.publicado',
        entidad: 'tarifario',
        entidadId: v.id,
        datos: { version: v.version, moneda: d.moneda, tarifas: d.tarifas.length },
        ip: req.ip,
      });
      return v;
    });
    reply.code(201);
    return r;
  });
}
