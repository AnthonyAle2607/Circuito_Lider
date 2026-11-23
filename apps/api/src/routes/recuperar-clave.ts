import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@sp/db';
import { PedirRecuperacion, RestablecerClave } from '@sp/schemas';
import { newToken, sha256 } from '../auth/crypto';
import { hashPassword, passwordPolicyError } from '../auth/password';
import { contexto } from '../auth/sesiones';
import { HttpError, validar } from '../plugins/errores';

const MENSAJE = 'Si el correo tiene una cuenta, te enviamos un enlace para crear una clave nueva. Vence en 1 hora.';

/**
 * Recuperar la clave del anunciante (0013). Pedirla responde siempre lo mismo (no revela quién tiene cuenta); el
 * enlace va por correo (outbox → n8n) y sirve una vez durante 1 hora. Restablecer cierra todas las sesiones abiertas.
 */
export function rutasRecuperarClave(app: FastifyInstance, op: { db: Kysely<Database>; portalUrl: string; limiteAcceso: number; avisosEnConsola?: boolean }): void {
  const limite = { config: { rateLimit: { max: op.limiteAcceso, timeWindow: '1 minute' } } };

  app.post('/v1/cuentas/recuperar-clave', limite, async (req, reply) => {
    const d = validar(PedirRecuperacion, req.body);
    const codigo = newToken();
    const enlace = `${op.portalUrl}/restablecer?codigo=${codigo}`;
    const r = await sql<{ ok: boolean }>`select pedir_recuperacion_clave(${d.email}, ${sha256(codigo)}, ${enlace}, ${contexto(req).ip}::inet) as ok`.execute(op.db);
    if (r.rows[0]?.ok && op.avisosEnConsola) req.log.warn({ enlace }, 'DESARROLLO: enlace para restablecer la clave (en producción va por correo)');
    return reply.code(202).send({ mensaje: MENSAJE });
  });

  app.post('/v1/cuentas/restablecer-clave', limite, async (req, reply) => {
    const d = validar(RestablecerClave, req.body);
    const politica = passwordPolicyError(d.password);
    if (politica) throw new HttpError(400, 'clave_debil', politica);
    const r = await sql<{ u: string | null }>`select restablecer_clave(${sha256(d.codigo)}, ${await hashPassword(d.password)}, ${contexto(req).ip}::inet) as u`.execute(op.db);
    if (!r.rows[0]?.u) throw new HttpError(400, 'enlace_invalido', 'El enlace no es válido o ya venció. Pide uno nuevo.');
    return reply.code(204).send();
  });
}
