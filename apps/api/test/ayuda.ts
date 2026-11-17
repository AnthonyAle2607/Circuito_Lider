import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { baseDePrueba } from '@sp/db/testing';
import { buildApp } from '../src/app';
import { encryptSecret } from '../src/auth/crypto';
import { hashPassword } from '../src/auth/password';
import { hotp, newTotpSecret } from '../src/auth/totp';

export const MFA_KEY = Buffer.alloc(32, 7);
export const CLAVE = 'Clave-de-prueba-123';

/**
 * La API completa sobre PGlite corriendo con el rol real `app_api`. `dueño()` corre algo como dueño de la base
 * (sembrar y mirar sin RLS) y vuelve al rol de la API.
 */
export async function montar(op: { limiteAcceso?: number } = {}) {
  const b = await baseDePrueba();
  const app: FastifyInstance = await buildApp({
    comprobaciones: {},
    db: b.db,
    mfaKey: MFA_KEY,
    portalUrl: 'https://portal.prueba',
    trustProxy: true,
    limites: { general: 1000, acceso: op.limiteAcceso ?? 1000 },
  });
  await app.ready();
  await b.comoApi();

  const dueño = async <T>(fn: () => Promise<T>): Promise<T> => {
    await b.comoDueno();
    try {
      return await fn();
    } finally {
      await b.comoApi();
    }
  };
  const q = <T>(sqlTexto: string, p: unknown[] = []) => dueño(async () => (await b.pg.query<T>(sqlTexto, p)).rows);

  let n = 0;
  const ip = () => ({ 'x-forwarded-for': `10.9.${(n >> 8) & 255}.${++n & 255}` });

  async function miembroEquipo(roles: string[] = ['ventas']) {
    const id = randomUUID();
    const secreto = newTotpSecret();
    const email = `equipo${n++}@invermedia.com`;
    await q(
      `INSERT INTO equipo (id, email, nombre, password_hash, roles, totp_secreto_cifrado) VALUES ($1, $2, 'Eva', $3, $4::rol_equipo[], $5)`,
      [id, email, await hashPassword(CLAVE), `{${roles.join(',')}}`, encryptSecret(MFA_KEY, secreto, id)],
    );
    const codigo = (desfase = 0) => hotp(secreto, Math.floor(Date.now() / 30_000) + desfase);
    return { id, email, secreto, codigo };
  }

  const cerrar = async () => {
    await app.close();
    await b.cerrar();
  };
  return { app, b, q, dueño, ip, miembroEquipo, cerrar };
}
