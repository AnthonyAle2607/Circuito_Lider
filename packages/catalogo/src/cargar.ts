import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@sp/db';
import { segundosEstimados, type ArchivoParrilla } from './datos';

export interface ResultadoCarga {
  emisoras: number;
  programas: number;
  franjas: number;
}

type Programa = ArchivoParrilla['nacionales'][number];

/**
 * Carga la parrilla del archivo. Solo AÑADE lo que falta (por clave natural): nunca pisa lo que el equipo corrigió en
 * el panel ni borra nada. Repetirla no cambia nada. Corre con el rol dueño (la aplicación no puede crear catálogo).
 */
export async function cargarParrilla(db: Kysely<Database>, a: ArchivoParrilla): Promise<ResultadoCarga> {
  return db.transaction().execute(async (t) => {
    const nuevo: ResultadoCarga = { emisoras: 0, programas: 0, franjas: 0 };

    await t.insertInto('circuitos').values({ nombre: a.circuito }).onConflict((oc) => oc.column('nombre').doNothing()).execute();
    const circuito = await t.selectFrom('circuitos').select('id').where('nombre', '=', a.circuito).executeTakeFirstOrThrow();

    const idEmisora = new Map<string, string>();
    for (const e of a.emisoras) {
      const r = await t
        .insertInto('emisoras')
        .values({ circuito_id: circuito.id, slug: e.slug, nombre: e.nombre, ciudad: e.ciudad, frecuencia: e.frecuencia })
        .onConflict((oc) => oc.column('slug').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (r) nuevo.emisoras++;
      const fila = await t.selectFrom('emisoras').select('id').where('slug', '=', e.slug).executeTakeFirstOrThrow();
      idEmisora.set(e.slug, fila.id);
    }

    const cargarPrograma = async (p: Programa, emisoraId: string | null) => {
      const r = await t
        .insertInto('programas')
        .values({
          circuito_id: circuito.id,
          emisora_id: emisoraId,
          nombre: p.nombre,
          alcance: emisoraId ? 'local' : 'nacional',
          locutores: p.locutores ?? null,
        })
        .onConflict((oc) => oc.constraint('programas_unico').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (r) nuevo.programas++;
      let q = t.selectFrom('programas').select('id').where('circuito_id', '=', circuito.id).where('nombre', '=', p.nombre);
      q = emisoraId ? q.where('emisora_id', '=', emisoraId) : q.where('emisora_id', 'is', null);
      const programa = await q.executeTakeFirstOrThrow();
      nuevo.franjas += await cargarFranjas(t, programa.id, p, a.segundos_por_hora);
    };

    for (const p of a.nacionales) await cargarPrograma(p, null);
    for (const [slug, programas] of Object.entries(a.locales)) {
      for (const p of programas) await cargarPrograma(p, idEmisora.get(slug)!);
    }
    return nuevo;
  });
}

async function cargarFranjas(t: Transaction<Database>, programaId: string, p: Programa, segundosPorHora: number): Promise<number> {
  let n = 0;
  for (const f of p.franjas) {
    for (const dia of f.dias) {
      const r = await t
        .insertInto('franjas')
        .values({
          programa_id: programaId,
          dia_semana: dia,
          hora_inicio: f.inicio,
          hora_fin: f.fin,
          segundos_tanda: segundosEstimados(f.inicio, f.fin, segundosPorHora),
        })
        .onConflict((oc) => oc.constraint('franjas_unica').doNothing())
        .returning('id')
        .executeTakeFirst();
      if (r) n++;
    }
  }
  return n;
}
