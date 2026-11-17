import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { withTenant, type Database } from '@sp/db';
import { Ingreso, Registro, VerificarCorreo, type SesionAbierta, type Yo } from '@sp/schemas';
import { newToken, sha256 } from '../auth/crypto';
import { hashPassword, passwordPolicyError, verifyAgainstDummy, verifyPassword } from '../auth/password';
import { abrirSesion, cerrarSesion, contexto, exigirAnunciante } from '../auth/sesiones';
import { HttpError, validar } from '../plugins/errores';

export interface OpcionesCuentas {
  db: Kysely<Database>;
  /** Base del enlace de verificación que recibe el cliente por correo. */
  portalUrl: string;
  /** Solo desarrollo: escribe el enlace de verificación en el registro del servidor (no hay correo todavía). */
  avisosEnConsola?: boolean;
  /** Límite de intentos por minuto y dirección en registro e ingreso. */
  limiteAcceso: number;
}

const VIGENCIA_VERIFICACION_MS = 48 * 60 * 60_000;
const MENSAJE_REGISTRO = 'Si el correo es válido, te enviamos un enlace para confirmarlo.';
const NO_COINCIDE = () => new HttpError(401, 'credenciales', 'Correo o clave incorrectos.');

function esCorreoRepetido(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  return e?.code === '23505' || /usuarios_email_key/.test(e?.message ?? '');
}

export async function rutasCuentas(app: FastifyInstance, op: OpcionesCuentas): Promise<void> {
  const { db } = op;
  const limite = { config: { rateLimit: { max: op.limiteAcceso, timeWindow: '1 minute' } } };

  /**
   * Registro del anunciante. Responde lo mismo exista o no el correo (no revela quién tiene cuenta). Crea el anunciante,
   * su primer usuario, el código de verificación, la fila de bitácora y el evento para el correo, todo en una transacción.
   */
  app.post('/v1/cuentas/registro', limite, async (req, reply) => {
    const d = validar(Registro, req.body);
    const politica = passwordPolicyError(d.password);
    if (politica) throw new HttpError(400, 'clave_debil', politica);

    const passwordHash = await hashPassword(d.password);
    const anuncianteId = randomUUID();
    const codigo = newToken();
    const enlace = `${op.portalUrl}/verificar?codigo=${codigo}`;
    const ctx = contexto(req);

    try {
      await withTenant(db, anuncianteId, async (t) => {
        await t
          .insertInto('anunciantes')
          .values({ id: anuncianteId, empresa: d.empresa, pais: d.pais, ...(d.zonaHoraria && { zona_horaria: d.zonaHoraria }) })
          .execute();
        const u = await t
          .insertInto('usuarios')
          .values({ anunciante_id: anuncianteId, email: d.email, nombre: d.nombre, password_hash: passwordHash })
          .returning('id')
          .executeTakeFirstOrThrow();
        await t
          .insertInto('verificaciones_correo')
          .values({
            anunciante_id: anuncianteId,
            usuario_id: u.id,
            codigo_hash: sha256(codigo),
            expira_at: new Date(Date.now() + VIGENCIA_VERIFICACION_MS),
          })
          .execute();
        await registrar(t, {
          anuncianteId,
          actor: { tipo: 'anunciante', id: u.id },
          accion: 'cuenta.registrada',
          entidad: 'anunciante',
          entidadId: anuncianteId,
          datos: { pais: d.pais },
          ip: ctx.ip,
        });
        await t
          .insertInto('outbox')
          .values({
            anunciante_id: anuncianteId,
            tipo: 'cuenta.registrada',
            datos: JSON.stringify({ usuario_id: u.id, email: d.email, nombre: d.nombre, enlace }),
          })
          .execute();
      });
    } catch (err) {
      if (!esCorreoRepetido(err)) throw err;
      req.log.info('registro con un correo que ya existe');
      return reply.code(202).send({ mensaje: MENSAJE_REGISTRO });
    }

    if (op.avisosEnConsola) req.log.warn({ enlace }, 'DESARROLLO: enlace de verificación (en producción va por correo)');
    return reply.code(202).send({ mensaje: MENSAJE_REGISTRO });
  });

  app.post('/v1/cuentas/verificar-correo', limite, async (req) => {
    const { codigo } = validar(VerificarCorreo, req.body);
    const r = await sql<{ usuario_id: string; anunciante_id: string }>`
      select usuario_id, anunciante_id from verificar_correo(${sha256(codigo)})`.execute(db);
    const fila = r.rows[0];
    if (!fila) throw new HttpError(400, 'enlace_invalido', 'El enlace no es válido o ya venció. Pide uno nuevo.');
    await withTenant(db, fila.anunciante_id, (t) =>
      registrar(t, {
        anuncianteId: fila.anunciante_id,
        actor: { tipo: 'anunciante', id: fila.usuario_id },
        accion: 'correo.verificado',
        entidad: 'usuario',
        entidadId: fila.usuario_id,
        ip: req.ip,
      }),
    );
    return { ok: true };
  });

  app.post('/v1/cuentas/ingresar', limite, async (req): Promise<SesionAbierta> => {
    const d = validar(Ingreso, req.body);
    const r = await sql<{ id: string; anunciante_id: string; password_hash: string; activo: boolean }>`
      select id, anunciante_id, password_hash, activo from buscar_usuario_para_ingreso(${d.email})`.execute(db);
    const u = r.rows[0];
    // Sin usuario se verifica igual contra un hash falso: responder «no existe» no debe tardar menos.
    const ok = u ? await verifyPassword(u.password_hash, d.password) : await verifyAgainstDummy(d.password);
    if (!u || !ok || !u.activo) throw NO_COINCIDE();

    const ctx = contexto(req);
    const sesion = await abrirSesion(db, { tipo: 'anunciante', usuarioId: u.id, anuncianteId: u.anunciante_id }, ctx);
    await withTenant(db, u.anunciante_id, async (t) => {
      await t.updateTable('usuarios').set({ ultimo_acceso_at: new Date() }).where('id', '=', u.id).execute();
      await registrar(t, {
        anuncianteId: u.anunciante_id,
        actor: { tipo: 'anunciante', id: u.id },
        accion: 'sesion.iniciada',
        entidad: 'usuario',
        entidadId: u.id,
        ip: ctx.ip,
      });
    });
    return sesion;
  });

  app.post('/v1/cuentas/salir', { preHandler: exigirAnunciante(db) }, async (req, reply) => {
    const p = req.principal!;
    await cerrarSesion(db, p.sesionId);
    return reply.code(204).send();
  });

  app.get('/v1/cuentas/yo', { preHandler: exigirAnunciante(db) }, async (req): Promise<Yo> => {
    const p = req.principal;
    if (p?.tipo !== 'anunciante') throw new HttpError(401, 'no_autorizado', 'Inicia sesión para continuar.');
    return withTenant(db, p.anuncianteId, async (t) => {
      const fila = await t
        .selectFrom('usuarios')
        .innerJoin('anunciantes', 'anunciantes.id', 'usuarios.anunciante_id')
        .select([
          'usuarios.id',
          'usuarios.nombre',
          'usuarios.email',
          'usuarios.correo_verificado_at',
          'anunciantes.id as anunciante_id',
          'anunciantes.empresa',
          'anunciantes.pais',
          'anunciantes.zona_horaria',
        ])
        .where('usuarios.id', '=', p.usuarioId)
        .executeTakeFirstOrThrow();
      return {
        usuario: { id: fila.id, nombre: fila.nombre, email: fila.email, correoVerificado: fila.correo_verificado_at !== null },
        anunciante: { id: fila.anunciante_id, empresa: fila.empresa, pais: fila.pais, zonaHoraria: fila.zona_horaria },
      };
    });
  });
}
