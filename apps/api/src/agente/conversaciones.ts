import { createHash, randomBytes } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { sql, type Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import type { Database } from '@sp/db';
import { hoyEnCaracas } from '@sp/inventory';
import { VERSION_INSTRUCCIONES, type Efectos, type Turno } from '@sp/sales-agent';

/**
 * Guardar y leer conversaciones del agente. El navegador guarda un token al azar; la base, solo su hash (como las
 * sesiones). Los mensajes se guardan tal cual y no se editan: se reenvían idénticos en cada turno.
 */
const hash = (token: string) => createHash('sha256').update(token).digest();

export interface Conversacion {
  id: string;
  estado: 'agente' | 'traspasada' | 'cerrada';
  turnos: number;
  costoMicroUsd: number;
  efectos: Efectos;
}

export async function crearConversacion(db: Kysely<Database>, ip: string | null): Promise<{ token: string; conversacion: Conversacion }> {
  const token = randomBytes(24).toString('base64url');
  const f = await db.insertInto('conversaciones').values({ token_hash: hash(token), version_instrucciones: VERSION_INSTRUCCIONES, ip, anunciante_id: null, usuario_id: null, traspaso_motivo: null, traspaso_resumen: null, traspasada_at: null }).returning('id').executeTakeFirstOrThrow();
  return { token, conversacion: { id: f.id, estado: 'agente', turnos: 0, costoMicroUsd: 0, efectos: { prospecto: {}, cotizaciones: [], traspaso: null } } };
}

export async function buscarConversacion(db: Kysely<Database>, token: string): Promise<Conversacion | null> {
  const f = await db.selectFrom('conversaciones').selectAll().where('token_hash', '=', hash(token)).executeTakeFirst();
  if (!f) return null;
  return {
    id: f.id,
    estado: f.estado,
    turnos: f.turnos,
    costoMicroUsd: Number(f.costo_micro_usd),
    efectos: {
      prospecto: (f.prospecto ?? {}) as Efectos['prospecto'],
      cotizaciones: f.cotizaciones ?? [],
      traspaso: f.traspaso_motivo ? { motivo: f.traspaso_motivo, resumen: f.traspaso_resumen ?? '' } : null,
    },
  };
}

export async function historial(db: Kysely<Database>, conversacionId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const filas = await db.selectFrom('conversacion_mensajes').select(['rol', 'contenido']).where('conversacion_id', '=', conversacionId).orderBy('orden').execute();
  return filas.map((f) => ({ role: f.rol, content: f.contenido }) as Anthropic.Beta.BetaMessageParam);
}

export async function gastoDeHoy(db: Kysely<Database>): Promise<number> {
  const f = await db.selectFrom('agente_gasto_diario').select('costo_micro_usd').where('dia', '=', hoyEnCaracas()).executeTakeFirst();
  return Number(f?.costo_micro_usd ?? 0);
}

/** Guarda el turno: mensajes nuevos, contadores, gasto del día, lo que el agente hizo (bitácora, P12) y el traspaso. */
export async function guardarTurno(db: Kysely<Database>, c: Conversacion, t: Turno, cuenta: { anuncianteId: string; usuarioId: string } | null): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // Lo guardado antes de este turno (en memoria, los efectos ya incluyen lo nuevo). Bloquea la fila: dos turnos
    // simultáneos de la misma conversación se ordenan.
    const previa = await trx.selectFrom('conversaciones').select('cotizaciones').where('id', '=', c.id).forUpdate().executeTakeFirstOrThrow();
    const antes = new Set(previa.cotizaciones);
    const n = await trx.selectFrom('conversacion_mensajes').select((eb) => eb.fn.countAll<number>().as('n')).where('conversacion_id', '=', c.id).executeTakeFirstOrThrow();
    if (t.nuevos.length) {
      await trx
        .insertInto('conversacion_mensajes')
        .values(t.nuevos.map((m, i) => ({ conversacion_id: c.id, orden: Number(n.n) + i, rol: m.role, contenido: JSON.stringify(m.content) })))
        .execute();
    }
    const traspasa = c.efectos.traspaso && c.estado === 'agente';
    await trx
      .updateTable('conversaciones')
      .set((eb) => ({
        turnos: eb('turnos', '+', 1),
        tokens_entrada: eb('tokens_entrada', '+', t.uso.entrada),
        tokens_salida: eb('tokens_salida', '+', t.uso.salida),
        tokens_cache_lectura: eb('tokens_cache_lectura', '+', t.uso.cacheLectura),
        tokens_cache_escritura: eb('tokens_cache_escritura', '+', t.uso.cacheEscritura),
        costo_micro_usd: eb('costo_micro_usd', '+', t.costoMicroUsd),
        prospecto: JSON.stringify(c.efectos.prospecto),
        cotizaciones: c.efectos.cotizaciones,
        actualizado_at: new Date(),
        ...(cuenta && { anunciante_id: cuenta.anuncianteId, usuario_id: cuenta.usuarioId }),
        ...(traspasa && { estado: 'traspasada' as const, traspaso_motivo: c.efectos.traspaso!.motivo.slice(0, 300), traspaso_resumen: c.efectos.traspaso!.resumen.slice(0, 1500), traspasada_at: new Date() }),
      }))
      .where('id', '=', c.id)
      .execute();
    await sql`insert into agente_gasto_diario (dia, costo_micro_usd) values (${hoyEnCaracas()}, ${t.costoMicroUsd})
      on conflict (dia) do update set costo_micro_usd = agente_gasto_diario.costo_micro_usd + excluded.costo_micro_usd`.execute(trx);
    for (const id of c.efectos.cotizaciones.filter((x) => !antes.has(x))) {
      await registrar(trx, { anuncianteId: cuenta?.anuncianteId ?? null, actor: { tipo: 'agente', nombre: 'agente-vendedor' }, accion: 'cotizacion.creada', entidad: 'cotizacion', entidadId: id, datos: { conversacion_id: c.id } });
    }
    if (traspasa) {
      await trx.insertInto('outbox').values({ tipo: 'agente.traspaso', datos: JSON.stringify({ conversacion_id: c.id, motivo: c.efectos.traspaso!.motivo }) }).execute();
    }
  });
}
