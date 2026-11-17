import type { FastifyInstance } from 'fastify';
import { sql, type Kysely, type Transaction } from 'kysely';
import { registrar } from '@sp/audit';
import { parrillaDeEmisora, tarifarioPorId, tarifarioVigente } from '@sp/catalogo';
import { cotizacion as fsmCotizacion } from '@sp/core-fsm';
import { withTenant, type Database } from '@sp/db';
import { SinCupo, diaIso, hoyEnCaracas, segundosLibres, sumarDias, tomarCupos } from '@sp/inventory';
import { SinTarifa, cotizar, type Alcance } from '@sp/pricing';
import {
  ConsultaDisponibilidad,
  PedirCotizacion,
  Reservar,
  type Cotizacion,
  type Disponible,
  type Pedido,
} from '@sp/schemas';
import { contexto, exigirAnunciante } from '../auth/sesiones';
import { HttpError, validar } from '../plugins/errores';
import { leerPedido } from './pedidos';

type Db = Kysely<Database> | Transaction<Database>;

export interface OpcionesCotizaciones {
  db: Kysely<Database>;
  /** Versión vigente de los términos que el cliente acepta al reservar. */
  terminosVersion: string;
  limiteCotizar: number;
}

/** Hasta cuántos días hacia adelante se vende (y desde mañana: el mismo día no da tiempo a revisar el spot). */
const HORIZONTE_DIAS = 180;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Detalle de cada línea con su programa, horario y dónde suena. */
async function lineasDe(db: Db, cotizacionId: string): Promise<Cotizacion['lineas']> {
  const filas = await db
    .selectFrom('cotizacion_lineas as l')
    .innerJoin('franjas as f', 'f.id', 'l.franja_id')
    .innerJoin('programas as p', 'p.id', 'f.programa_id')
    .leftJoin('emisoras as e', 'e.id', 'p.emisora_id')
    .select([
      'l.franja_id',
      'l.fecha',
      'l.precio_centimos',
      'p.nombre',
      'p.alcance',
      'e.ciudad',
      sql<string>`f.hora_inicio::text`.as('inicio'),
      sql<string>`f.hora_fin::text`.as('fin'),
    ])
    .where('l.cotizacion_id', '=', cotizacionId)
    .orderBy('l.fecha')
    .orderBy('f.hora_inicio')
    .execute();
  return filas.map((r) => ({
    franjaId: r.franja_id,
    fecha: r.fecha,
    programa: r.nombre,
    alcance: r.alcance,
    donde: r.alcance === 'nacional' ? 'En cadena nacional' : (r.ciudad ?? ''),
    inicio: r.inicio.slice(0, 5),
    fin: r.fin.slice(0, 5),
    precioCentimos: r.precio_centimos,
  }));
}

/** La cotización tal como la ve el cliente. Una vigente cuyo plazo pasó se muestra como vencida. */
export async function leerCotizacion(db: Db, id: string): Promise<Cotizacion | null> {
  const c = await db.selectFrom('cotizaciones').selectAll().where('id', '=', id).executeTakeFirst();
  if (!c) return null;
  const t = await db.selectFrom('tarifarios').select(['version', 'es_ejemplo']).where('id', '=', c.tarifario_id).executeTakeFirstOrThrow();
  const vencida = c.vence_at < new Date() && (c.estado === 'vigente' || c.estado === 'en_aprobacion');
  return {
    id: c.id,
    estado: vencida ? 'vencida' : c.estado,
    venceAt: c.vence_at.toISOString(),
    moneda: c.moneda,
    esEjemplo: t.es_ejemplo,
    tarifarioVersion: t.version,
    duracionSegundos: c.duracion_segundos,
    emisiones: c.emisiones,
    subtotalCentimos: c.subtotal_centimos,
    descuentoBps: c.subtotal_centimos === 0 ? 0 : Math.round((c.descuento_centimos * 10_000) / c.subtotal_centimos),
    descuentoCentimos: c.descuento_centimos,
    totalCentimos: c.total_centimos,
    requiereAprobacion: c.requiere_aprobacion,
    lineas: await lineasDe(db, c.id),
  };
}

export async function rutasCotizaciones(app: FastifyInstance, op: OpcionesCotizaciones): Promise<void> {
  const { db } = op;

  /** Segundos libres de cada franja de una emisora, día por día. Público. */
  app.get('/v1/disponibilidad', async (req): Promise<Disponible[]> => {
    const q = validar(ConsultaDisponibilidad, req.query);
    const p = await parrillaDeEmisora(db, q.emisora, { soloActivas: true });
    if (!p) throw new HttpError(404, 'emisora_no_existe', 'No encontramos esa emisora.');
    const fechas = Array.from({ length: q.dias }, (_, i) => sumarDias(q.desde, i));
    const casillas = p.programas.flatMap((pr) =>
      pr.franjas.flatMap((f) => fechas.filter((d) => diaIso(d) === f.dia).map((fecha) => ({ pr, f, fecha }))),
    );
    const libres = new Map(
      (await segundosLibres(db, casillas.map((c) => ({ franjaId: c.f.id, fecha: c.fecha })))).map((l) => [`${l.franjaId}|${l.fecha}`, l]),
    );
    return casillas
      .map(({ pr, f, fecha }) => {
        const l = libres.get(`${f.id}|${fecha}`);
        return {
          franjaId: f.id,
          fecha,
          programa: pr.nombre,
          alcance: pr.alcance,
          inicio: f.inicio,
          fin: f.fin,
          capacidad: l?.capacidad ?? f.segundosTanda,
          libres: l?.libres ?? f.segundosTanda,
          cupoConfirmado: f.cupoConfirmado,
        };
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio));
  });

  /**
   * Cotiza sin cuenta: valida cada emisión contra la parrilla (franja activa, día correcto, desde mañana), comprueba que
   * hoy hay cupo, calcula con el tarifario vigente y guarda el precio con su vigencia (P4). No retiene espacios.
   */
  app.post(
    '/v1/cotizaciones',
    { config: { rateLimit: { max: op.limiteCotizar, timeWindow: '1 minute' } } },
    async (req, reply): Promise<Cotizacion> => {
      const d = validar(PedirCotizacion, req.body);
      const claves = new Set(d.emisiones.map((e) => `${e.franjaId}|${e.fecha}`));
      if (claves.size !== d.emisiones.length) throw new HttpError(400, 'emisiones_repetidas', 'Hay emisiones repetidas (misma franja y fecha).');

      const t = await tarifarioVigente(db);
      if (!t) throw new HttpError(503, 'sin_tarifario', 'Todavía no hay tarifario publicado. Intenta más tarde.');

      const hoy = hoyEnCaracas();
      const primera = sumarDias(hoy, 1);
      const ultima = sumarDias(hoy, HORIZONTE_DIAS);
      const ids = [...new Set(d.emisiones.map((e) => e.franjaId))];
      const franjas = new Map(
        (
          await db
            .selectFrom('franjas as f')
            .innerJoin('programas as p', 'p.id', 'f.programa_id')
            .select(['f.id', 'f.dia_semana', 'f.activa', 'p.activo', 'p.alcance'])
            .where('f.id', 'in', ids)
            .execute()
        ).map((f) => [f.id, f]),
      );
      const emisiones: Array<{ franjaId: string; fecha: string; alcance: Alcance }> = [];
      for (const e of d.emisiones) {
        const f = franjas.get(e.franjaId);
        if (!f || !f.activa || !f.activo) throw new HttpError(400, 'franja_invalida', 'Una de las franjas no existe o ya no se vende.');
        if (e.fecha < primera || e.fecha > ultima) {
          throw new HttpError(400, 'fecha_fuera_de_rango', `Las fechas van de ${primera} a ${ultima} (hora de Venezuela).`);
        }
        if (diaIso(e.fecha) !== f.dia_semana) throw new HttpError(400, 'dia_incorrecto', `El ${e.fecha} no hay emisión de esa franja.`);
        emisiones.push({ ...e, alcance: f.alcance });
      }

      let precio;
      try {
        precio = cotizar(t, d.duracionSegundos, emisiones);
      } catch (err) {
        if (err instanceof SinTarifa) throw new HttpError(400, 'duracion_sin_precio', err.message);
        throw err;
      }

      const libres = await segundosLibres(db, emisiones);
      const sinCupo = libres.filter((l) => l.libres < d.duracionSegundos);
      if (sinCupo.length) {
        return reply.code(409).send({
          error: 'sin_cupo',
          mensaje: `No queda espacio en ${sinCupo.length} de las emisiones elegidas.`,
          faltantes: sinCupo.map((l) => ({ franjaId: l.franjaId, fecha: l.fecha })),
        });
      }

      const id = await db.transaction().execute(async (trx) => {
        const c = await trx
          .insertInto('cotizaciones')
          .values({
            tarifario_id: t.id,
            moneda: precio.moneda,
            duracion_segundos: d.duracionSegundos,
            emisiones: precio.emisiones,
            subtotal_centimos: precio.subtotalCentimos,
            descuento_centimos: precio.descuentoCentimos,
            total_centimos: precio.totalCentimos,
            estado: precio.requiereAprobacion ? 'en_aprobacion' : 'vigente',
            requiere_aprobacion: precio.requiereAprobacion,
            vence_at: new Date(Date.now() + t.vigenciaCotizacionHoras * 3_600_000),
            ip: req.ip,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('cotizacion_lineas')
          .values(precio.lineas.map((l) => ({ cotizacion_id: c.id, franja_id: l.franjaId, fecha: l.fecha, precio_centimos: l.precioCentimos })))
          .execute();
        if (precio.requiereAprobacion) {
          await trx.insertInto('outbox').values({ tipo: 'cotizacion.en_aprobacion', datos: JSON.stringify({ cotizacion_id: c.id }) }).execute();
        }
        return c.id;
      });
      reply.code(201);
      return (await leerCotizacion(db, id))!;
    },
  );

  app.get<{ Params: { id: string } }>('/v1/cotizaciones/:id', async (req): Promise<Cotizacion> => {
    const c = UUID.test(req.params.id) ? await leerCotizacion(db, req.params.id) : null;
    if (!c) throw new HttpError(404, 'cotizacion_no_existe', 'No encontramos esa cotización.');
    return c;
  });

  /**
   * Reserva: el anunciante (con el correo verificado) acepta los términos, se crea el pedido y se retienen los espacios
   * hasta el vencimiento. Todo en una transacción: si un solo espacio ya no cabe, no se reserva nada.
   */
  app.post<{ Params: { id: string } }>(
    '/v1/cotizaciones/:id/reservar',
    { preHandler: exigirAnunciante(db) },
    async (req, reply): Promise<Pedido> => {
      const p = req.principal;
      if (p?.tipo !== 'anunciante') throw new HttpError(401, 'no_autorizado', 'Inicia sesión para continuar.');
      if (!UUID.test(req.params.id)) throw new HttpError(404, 'cotizacion_no_existe', 'No encontramos esa cotización.');
      const d = validar(Reservar, req.body);
      if (d.terminosVersion !== op.terminosVersion) {
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
    },
  );
}
