import type { Kysely } from 'kysely';
import { tarifarioVigente } from '@sp/catalogo';
import type { Database } from '@sp/db';
import { diaIso, hoyEnCaracas, segundosLibres, sumarDias } from '@sp/inventory';
import { SinTarifa, cotizar, type Alcance } from '@sp/pricing';
import { HttpError } from '../../plugins/errores';

/**
 * Crear una cotización: la función de dominio que usan la ruta del portal y el agente vendedor (P11: el agente no
 * tiene más poder que el portal). Valida cada emisión contra la parrilla, comprueba el cupo de hoy, calcula con el
 * tarifario vigente y guarda el precio con su vigencia (P4). No retiene espacios. Lanza HttpError si algo no cabe.
 */

/** Hasta cuántos días hacia adelante se vende (y desde mañana: el mismo día no da tiempo a revisar el spot). */
export const HORIZONTE_DIAS = 180;

export interface PedidoDeCotizacion {
  duracionSegundos: number;
  emisiones: Array<{ franjaId: string; fecha: string }>;
}

type Emision = { franjaId: string; fecha: string; alcance: Alcance };

async function validarEmisiones(db: Kysely<Database>, pedidas: PedidoDeCotizacion['emisiones']): Promise<Emision[]> {
  const claves = new Set(pedidas.map((e) => `${e.franjaId}|${e.fecha}`));
  if (claves.size !== pedidas.length) throw new HttpError(400, 'emisiones_repetidas', 'Hay emisiones repetidas (misma franja y fecha).');
  const hoy = hoyEnCaracas();
  const primera = sumarDias(hoy, 1);
  const ultima = sumarDias(hoy, HORIZONTE_DIAS);
  const ids = [...new Set(pedidas.map((e) => e.franjaId))];
  const filas = await db
    .selectFrom('franjas as f')
    .innerJoin('programas as p', 'p.id', 'f.programa_id')
    .select(['f.id', 'f.dia_semana', 'f.activa', 'p.activo', 'p.alcance'])
    .where('f.id', 'in', ids)
    .execute();
  const franjas = new Map(filas.map((f) => [f.id, f]));
  return pedidas.map((e) => {
    const f = franjas.get(e.franjaId);
    if (!f || !f.activa || !f.activo) throw new HttpError(400, 'franja_invalida', 'Una de las franjas no existe o ya no se vende.');
    if (e.fecha < primera || e.fecha > ultima) {
      throw new HttpError(400, 'fecha_fuera_de_rango', `Las fechas van de ${primera} a ${ultima} (hora de Venezuela).`);
    }
    if (diaIso(e.fecha) !== f.dia_semana) throw new HttpError(400, 'dia_incorrecto', `El ${e.fecha} no hay emisión de esa franja.`);
    return { ...e, alcance: f.alcance };
  });
}

/** Devuelve el id de la cotización creada. `conversacionId` liga la cotización a la conversación del agente (P12). */
export async function crearCotizacion(db: Kysely<Database>, d: PedidoDeCotizacion, origen: { ip: string | null; conversacionId?: string }): Promise<string> {
  const t = await tarifarioVigente(db);
  if (!t) throw new HttpError(503, 'sin_tarifario', 'Todavía no hay tarifario publicado. Intenta más tarde.');
  const emisiones = await validarEmisiones(db, d.emisiones);

  let precio;
  try {
    precio = cotizar(t, d.duracionSegundos, emisiones);
  } catch (err) {
    if (err instanceof SinTarifa) throw new HttpError(400, 'duracion_sin_precio', err.message);
    throw err;
  }

  const sinCupo = (await segundosLibres(db, emisiones)).filter((l) => l.libres < d.duracionSegundos);
  if (sinCupo.length) {
    throw new HttpError(409, 'sin_cupo', `No queda espacio en ${sinCupo.length} de las emisiones elegidas.`, {
      faltantes: sinCupo.map((l) => ({ franjaId: l.franjaId, fecha: l.fecha })),
    });
  }

  return db.transaction().execute(async (trx) => {
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
        ip: origen.ip,
        conversacion_id: origen.conversacionId ?? null,
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
}
