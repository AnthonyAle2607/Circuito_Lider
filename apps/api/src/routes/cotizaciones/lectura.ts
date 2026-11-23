import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@sp/db';
import type { Cotizacion } from '@sp/schemas';

export type Db = Kysely<Database> | Transaction<Database>;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
