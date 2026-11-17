import { readFileSync } from 'node:fs';
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Database, TarifariosTabla } from '@sp/db';
import type { Tarifario } from '@sp/pricing';

type Db = Kysely<Database> | Transaction<Database>;

export const NuevoTarifario = z.object({
  moneda: z.string().regex(/^[A-Z]{3}$/),
  vigencia_cotizacion_horas: z.number().int().min(1).max(720),
  reserva_horas: z.number().int().min(1).max(168),
  umbral_aprobacion_centimos: z.number().int().min(0),
  notas: z.string().max(2000).optional(),
  tarifas: z
    .array(z.object({ alcance: z.enum(['nacional', 'local']), duracion_segundos: z.number().int().min(10).max(120), precio_centimos: z.number().int().positive() }))
    .min(1),
  descuentos: z.array(z.object({ min_emisiones: z.number().int().min(2), descuento_bps: z.number().int().min(1).max(9000) })).default([]),
});
export type NuevoTarifario = z.infer<typeof NuevoTarifario>;

export interface TarifarioVigente extends Tarifario {
  vigenciaCotizacionHoras: number;
  reservaHoras: number;
}

/** El tarifario vigente ahora (el más reciente con vigente_desde pasado), o null si no hay ninguno cargado. */
export async function tarifarioVigente(db: Db, ahora = new Date()): Promise<TarifarioVigente | null> {
  const t = await db
    .selectFrom('tarifarios')
    .selectAll()
    .where('vigente_desde', '<=', ahora)
    .orderBy('vigente_desde', 'desc')
    .orderBy('version', 'desc')
    .executeTakeFirst();
  if (!t) return null;
  return leerTarifario(db, t);
}

export async function tarifarioPorId(db: Db, id: string): Promise<TarifarioVigente | null> {
  const t = await db.selectFrom('tarifarios').selectAll().where('id', '=', id).executeTakeFirst();
  return t ? leerTarifario(db, t) : null;
}

async function leerTarifario(db: Db, t: Selectable<TarifariosTabla>): Promise<TarifarioVigente> {
  const [tarifas, descuentos] = await Promise.all([
    db.selectFrom('tarifas').selectAll().where('tarifario_id', '=', t.id).execute(),
    db.selectFrom('descuentos_volumen').selectAll().where('tarifario_id', '=', t.id).orderBy('min_emisiones').execute(),
  ]);
  return {
    id: t.id,
    version: t.version,
    moneda: t.moneda,
    esEjemplo: t.es_ejemplo,
    umbralAprobacionCentimos: Number(t.umbral_aprobacion_centimos),
    vigenciaCotizacionHoras: t.vigencia_cotizacion_horas,
    reservaHoras: t.reserva_horas,
    tarifas: tarifas.map((x) => ({ alcance: x.alcance, duracionSegundos: x.duracion_segundos, precioCentimos: Number(x.precio_centimos) })),
    descuentos: descuentos.map((d) => ({ minEmisiones: d.min_emisiones, descuentoBps: d.descuento_bps })),
  };
}

/**
 * Publica una versión nueva del tarifario (P4: las anteriores no se tocan; las cotizaciones viejas conservan la suya).
 * Debe correr dentro de una transacción. Devuelve el id y el número de versión.
 */
export async function publicarTarifario(
  t: Transaction<Database>,
  d: NuevoTarifario,
  op: { vigenteDesde?: Date; esEjemplo?: boolean; creadoPor?: string | null } = {},
): Promise<{ id: string; version: number }> {
  // Serializa publicaciones simultáneas para que no choquen por el número de versión.
  await sql`select pg_advisory_xact_lock(hashtext('tarifarios'))`.execute(t);
  const ultima = await t.selectFrom('tarifarios').select((eb) => eb.fn.max('version').as('v')).executeTakeFirst();
  const version = Number(ultima?.v ?? 0) + 1;
  const { id } = await t
    .insertInto('tarifarios')
    .values({
      version,
      moneda: d.moneda,
      vigente_desde: op.vigenteDesde ?? new Date(),
      vigencia_cotizacion_horas: d.vigencia_cotizacion_horas,
      reserva_horas: d.reserva_horas,
      umbral_aprobacion_centimos: d.umbral_aprobacion_centimos,
      es_ejemplo: op.esEjemplo ?? false,
      notas: d.notas ?? null,
      creado_por: op.creadoPor ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await t
    .insertInto('tarifas')
    .values(d.tarifas.map((x) => ({ tarifario_id: id, alcance: x.alcance, duracion_segundos: x.duracion_segundos, precio_centimos: x.precio_centimos })))
    .execute();
  if (d.descuentos.length) {
    await t
      .insertInto('descuentos_volumen')
      .values(d.descuentos.map((x) => ({ tarifario_id: id, min_emisiones: x.min_emisiones, descuento_bps: x.descuento_bps })))
      .execute();
  }
  return { id, version };
}

/** Carga el tarifario de ejemplo SOLO si la base no tiene ninguno. Devuelve la versión creada o null. */
export async function cargarTarifarioEjemplo(db: Kysely<Database>, ruta: string): Promise<number | null> {
  const d = NuevoTarifario.parse(parse(readFileSync(ruta, 'utf8')));
  return db.transaction().execute(async (t) => {
    const hay = await t.selectFrom('tarifarios').select('id').executeTakeFirst();
    if (hay) return null;
    return (await publicarTarifario(t, d, { esEjemplo: true, vigenteDesde: new Date(Date.now() - 60_000) })).version;
  });
}
