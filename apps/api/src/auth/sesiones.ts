import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { rolesEquipo, type Database, type RolEquipo } from '@sp/db';
import { newToken, sha256 } from './crypto';
import { HttpError, noAutorizado } from '../plugins/errores';

const MIN = 60_000;
const HORA = 60 * MIN;

/** Duración de las sesiones: el anunciante, 12 h sin uso o 7 días; el equipo, 8 h sin uso o 12 h (una jornada). */
export const DURACION = {
  anunciante: { inactividad: 12 * HORA, absoluta: 7 * 24 * HORA },
  equipo: { inactividad: 8 * HORA, absoluta: 12 * HORA },
} as const;

export type Principal =
  | { tipo: 'anunciante'; sesionId: string; usuarioId: string; anuncianteId: string }
  | { tipo: 'equipo'; sesionId: string; equipoId: string; roles: RolEquipo[] };

export interface Contexto {
  ip: string;
  userAgent: string | null;
}

export function contexto(req: FastifyRequest): Contexto {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null };
}

type Dueño = { tipo: 'anunciante'; usuarioId: string; anuncianteId: string } | { tipo: 'equipo'; equipoId: string };

/** Crea la sesión y devuelve el token en claro UNA vez; en la base queda solo su hash. */
export async function abrirSesion(db: Kysely<Database>, dueño: Dueño, ctx: Contexto, ahora = new Date()) {
  const token = newToken();
  const d = DURACION[dueño.tipo];
  const expiraAbsoluta = new Date(ahora.getTime() + d.absoluta);
  await db
    .insertInto('sesiones')
    .values({
      token_hash: sha256(token),
      tipo: dueño.tipo,
      usuario_id: dueño.tipo === 'anunciante' ? dueño.usuarioId : null,
      anunciante_id: dueño.tipo === 'anunciante' ? dueño.anuncianteId : null,
      equipo_id: dueño.tipo === 'equipo' ? dueño.equipoId : null,
      expira_inactividad_at: new Date(ahora.getTime() + d.inactividad),
      expira_absoluta_at: expiraAbsoluta,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
    })
    .execute();
  return { token, expiraAt: expiraAbsoluta.toISOString() };
}

function tokenDe(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
}

/** Busca la sesión vigente del token y desliza su vencimiento por inactividad. */
export async function resolverSesion(db: Kysely<Database>, req: FastifyRequest): Promise<Principal | null> {
  const token = tokenDe(req);
  if (!token) return null;
  const ahora = new Date();
  const s = await db
    .selectFrom('sesiones')
    .leftJoin('equipo', 'equipo.id', 'sesiones.equipo_id')
    .select(['sesiones.id', 'sesiones.tipo', 'sesiones.usuario_id', 'sesiones.anunciante_id', 'sesiones.equipo_id', rolesEquipo, 'equipo.activo'])
    .where('sesiones.token_hash', '=', sha256(token))
    .where('sesiones.revocada_at', 'is', null)
    .where('sesiones.expira_inactividad_at', '>', ahora)
    .where('sesiones.expira_absoluta_at', '>', ahora)
    .executeTakeFirst();
  if (!s) return null;
  if (s.tipo === 'equipo' && s.activo !== true) return null;

  await db
    .updateTable('sesiones')
    .set({ ultimo_uso_at: ahora, expira_inactividad_at: new Date(ahora.getTime() + DURACION[s.tipo].inactividad) })
    .where('id', '=', s.id)
    .execute();

  if (s.tipo === 'anunciante') {
    return { tipo: 'anunciante', sesionId: s.id, usuarioId: s.usuario_id!, anuncianteId: s.anunciante_id! };
  }
  return { tipo: 'equipo', sesionId: s.id, equipoId: s.equipo_id!, roles: s.roles ?? [] };
}

export async function cerrarSesion(db: Kysely<Database>, sesionId: string): Promise<void> {
  await db.updateTable('sesiones').set({ revocada_at: new Date() }).where('id', '=', sesionId).where('revocada_at', 'is', null).execute();
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

/** preHandler: exige sesión de anunciante. */
export function exigirAnunciante(db: Kysely<Database>) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const p = await resolverSesion(db, req);
    if (!p || p.tipo !== 'anunciante') throw noAutorizado();
    req.principal = p;
  };
}

/** preHandler: exige sesión del equipo y, si se indican, al menos uno de los roles. */
export function exigirEquipo(db: Kysely<Database>, roles: RolEquipo[] = []) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const p = await resolverSesion(db, req);
    if (!p || p.tipo !== 'equipo') throw noAutorizado();
    if (roles.length && !roles.some((r) => p.roles.includes(r) || p.roles.includes('admin'))) {
      throw new HttpError(403, 'sin_permiso', 'Tu rol no permite esta acción.');
    }
    req.principal = p;
  };
}
