import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@sp/db';

type Db = Kysely<Database> | Transaction<Database>;

export interface Emisora {
  id: string;
  slug: string;
  nombre: string;
  ciudad: string;
  frecuencia: string;
  /** Señal en vivo, o null si todavía no se conoce. */
  streamUrl: string | null;
  descripcion: string | null;
}

export interface Franja {
  id: string;
  dia: number;
  inicio: string;
  fin: string;
  segundosTanda: number;
  cupoConfirmado: boolean;
  activa: boolean;
}

export interface ProgramaEnParrilla {
  id: string;
  nombre: string;
  alcance: 'nacional' | 'local';
  locutores: string | null;
  descripcion: string | null;
  franjas: Franja[];
}

export interface Parrilla {
  emisora: Emisora;
  zonaHoraria: string;
  programas: ProgramaEnParrilla[];
}

/** «HH:MM:SS» de Postgres → «HH:MM»; el fin del día se guarda como 24:00:00. */
const hhmm = (t: string) => t.slice(0, 5);

export async function listarEmisoras(db: Db): Promise<Emisora[]> {
  return db
    .selectFrom('emisoras')
    .select(['id', 'slug', 'nombre', 'ciudad', 'frecuencia', 'stream_url as streamUrl', 'descripcion'])
    .where('activa', '=', true)
    .orderBy('ciudad')
    .execute();
}

/**
 * La parrilla semanal de una emisora: los programas en cadena del circuito más los locales de esa emisora, con sus
 * franjas ordenadas por día y hora. `soloActivas` para el portal; el panel ve también las franjas que no se venden.
 */
export async function parrillaDeEmisora(db: Db, slug: string, op: { soloActivas?: boolean } = {}): Promise<Parrilla | null> {
  const e = await db
    .selectFrom('emisoras')
    .select(['id', 'slug', 'nombre', 'ciudad', 'frecuencia', 'stream_url as streamUrl', 'descripcion', 'circuito_id', 'zona_horaria'])
    .where('slug', '=', slug)
    .where('activa', '=', true)
    .executeTakeFirst();
  if (!e) return null;

  let q = db
    .selectFrom('franjas as f')
    .innerJoin('programas as p', 'p.id', 'f.programa_id')
    .select([
      'p.id as programa_id',
      'p.nombre',
      'p.alcance',
      'p.locutores',
      'p.descripcion as programa_descripcion',
      'f.id',
      'f.dia_semana',
      sql<string>`f.hora_inicio::text`.as('hora_inicio'),
      sql<string>`f.hora_fin::text`.as('hora_fin'),
      'f.segundos_tanda',
      'f.cupo_confirmado',
      'f.activa',
    ])
    .where('p.circuito_id', '=', e.circuito_id)
    .where('p.activo', '=', true)
    .where((w) => w.or([w('p.emisora_id', 'is', null), w('p.emisora_id', '=', e.id)]))
    .orderBy('f.dia_semana')
    .orderBy('f.hora_inicio')
    .orderBy('p.nombre');
  if (op.soloActivas) q = q.where('f.activa', '=', true);
  const filas = await q.execute();

  const programas = new Map<string, ProgramaEnParrilla>();
  for (const r of filas) {
    let p = programas.get(r.programa_id);
    if (!p) {
      p = { id: r.programa_id, nombre: r.nombre, alcance: r.alcance, locutores: r.locutores, descripcion: r.programa_descripcion, franjas: [] };
      programas.set(r.programa_id, p);
    }
    p.franjas.push({
      id: r.id,
      dia: r.dia_semana,
      inicio: hhmm(r.hora_inicio),
      fin: hhmm(r.hora_fin),
      segundosTanda: r.segundos_tanda,
      cupoConfirmado: r.cupo_confirmado,
      activa: r.activa,
    });
  }
  const { circuito_id: _c, zona_horaria, ...emisora } = e;
  return { emisora, zonaHoraria: zona_horaria, programas: [...programas.values()] };
}
