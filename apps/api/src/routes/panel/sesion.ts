import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { rolesEquipo, type Database } from '@sp/db';
import { CodigoEquipo, IngresoEquipo, type SesionAbierta, type YoEquipo } from '@sp/schemas';
import { decryptSecret, newToken, sha256 } from '../../auth/crypto';
import { verifyAgainstDummy, verifyPassword } from '../../auth/password';
import { abrirSesion, cerrarSesion, contexto, exigirEquipo } from '../../auth/sesiones';
import { verifyTotp } from '../../auth/totp';
import { HttpError, validar } from '../../plugins/errores';

export interface OpcionesSesionEquipo {
  db: Kysely<Database>;
  /** Llave de 32 bytes con la que se cifran los secretos TOTP (MFA_KEY). */
  mfaKey: Buffer;
  limiteAcceso: number;
}

const VIGENCIA_RETO_MS = 5 * 60_000;
const MAX_INTENTOS = 5;
const NO_COINCIDE = () => new HttpError(401, 'credenciales', 'Correo o clave incorrectos.');
const CODIGO_MAL = () => new HttpError(401, 'codigo_invalido', 'El código no es válido. Usa el de tu aplicación de autenticación.');

/**
 * Ingreso del equipo en dos pasos: clave → reto; reto + código TOTP → sesión. Sin el segundo factor no hay sesión.
 * Un código ya usado no sirve otra vez (se guarda el último paso de 30 s aceptado).
 */
export async function rutasSesionEquipo(app: FastifyInstance, op: OpcionesSesionEquipo): Promise<void> {
  const { db } = op;
  const limite = { config: { rateLimit: { max: op.limiteAcceso, timeWindow: '1 minute' } } };

  app.post('/v1/panel/sesion', limite, async (req) => {
    const d = validar(IngresoEquipo, req.body);
    const m = await db
      .selectFrom('equipo')
      .select(['id', 'password_hash', 'activo'])
      .where('email', '=', d.email)
      .executeTakeFirst();
    const ok = m ? await verifyPassword(m.password_hash, d.password) : await verifyAgainstDummy(d.password);
    if (!m || !ok || !m.activo) throw NO_COINCIDE();

    const reto = newToken();
    await db
      .insertInto('retos_equipo')
      .values({ reto_hash: sha256(reto), equipo_id: m.id, expira_at: new Date(Date.now() + VIGENCIA_RETO_MS) })
      .execute();
    return { reto };
  });

  app.post('/v1/panel/sesion/codigo', limite, async (req): Promise<SesionAbierta & { roles: string[] }> => {
    const d = validar(CodigoEquipo, req.body);
    const r = await db
      .selectFrom('retos_equipo')
      .innerJoin('equipo', 'equipo.id', 'retos_equipo.equipo_id')
      .select(['retos_equipo.id as reto_id', 'retos_equipo.intentos', 'equipo.id', 'equipo.totp_secreto_cifrado', rolesEquipo, 'equipo.activo'])
      .where('retos_equipo.reto_hash', '=', sha256(d.reto))
      .where('retos_equipo.usado_at', 'is', null)
      .where('retos_equipo.expira_at', '>', new Date())
      .executeTakeFirst();
    if (!r || !r.activo || r.intentos >= MAX_INTENTOS) {
      throw new HttpError(401, 'reto_vencido', 'Vuelve a escribir tu correo y clave.');
    }
    await db.updateTable('retos_equipo').set({ intentos: r.intentos + 1 }).where('id', '=', r.reto_id).execute();

    const secreto = decryptSecret(op.mfaKey, r.totp_secreto_cifrado, r.id);
    const paso = verifyTotp(secreto, d.codigo);
    if (paso === null) throw CODIGO_MAL();

    // Atómico: solo gana si el paso es posterior al último usado (dos peticiones con el mismo código: una sola entra).
    const usado = await db
      .updateTable('equipo')
      .set({ totp_ultimo_paso: paso, ultimo_acceso_at: new Date() })
      .where('id', '=', r.id)
      .where('totp_ultimo_paso', '<', paso)
      .executeTakeFirst();
    if (Number(usado.numUpdatedRows) === 0) throw CODIGO_MAL();

    await db.updateTable('retos_equipo').set({ usado_at: new Date() }).where('id', '=', r.reto_id).execute();
    const ctx = contexto(req);
    const sesion = await abrirSesion(db, { tipo: 'equipo', equipoId: r.id }, ctx);
    await registrar(db, {
      actor: { tipo: 'equipo', id: r.id },
      accion: 'equipo.sesion_iniciada',
      entidad: 'equipo',
      entidadId: r.id,
      ip: ctx.ip,
    });
    return { ...sesion, roles: r.roles };
  });

  app.post('/v1/panel/sesion/salir', { preHandler: exigirEquipo(db) }, async (req, reply) => {
    await cerrarSesion(db, req.principal!.sesionId);
    return reply.code(204).send();
  });

  app.get('/v1/panel/yo', { preHandler: exigirEquipo(db) }, async (req): Promise<YoEquipo> => {
    const p = req.principal;
    if (p?.tipo !== 'equipo') throw new HttpError(401, 'no_autorizado', 'Inicia sesión para continuar.');
    const m = await db.selectFrom('equipo').select(['id', 'nombre', 'email', rolesEquipo]).where('id', '=', p.equipoId).executeTakeFirstOrThrow();
    return { id: m.id, nombre: m.nombre, email: m.email, roles: m.roles };
  });
}
