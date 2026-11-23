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
export async function montar(
  op: {
    limiteAcceso?: number;
    almacen?: import('@sp/spots').Almacen;
    pasarela?: import('@sp/payments').Pasarela;
    transferencia?: { datos: import('@sp/schemas').DatosTransferencia; maximoBytes: number };
  } = {},
) {
  const b = await baseDePrueba();
  const app: FastifyInstance = await buildApp({
    comprobaciones: {},
    db: b.db,
    mfaKey: MFA_KEY,
    portalUrl: 'https://portal.prueba',
    trustProxy: true,
    limites: { general: 1000, acceso: op.limiteAcceso ?? 1000 },
    ...(op.almacen && { almacen: op.almacen }),
    ...(op.pasarela && { pasarela: op.pasarela }),
    ...(op.transferencia && { transferencia: op.transferencia }),
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

  /** Sesión del equipo (clave + código) con los roles pedidos: devuelve la cabecera Authorization. */
  async function sesionEquipo(roles: string[]) {
    const e = await miembroEquipo(roles);
    const { reto } = (await app.inject({ method: 'POST', url: '/v1/panel/sesion', payload: { email: e.email, password: CLAVE }, headers: ip() })).json();
    const { token } = (await app.inject({ method: 'POST', url: '/v1/panel/sesion/codigo', payload: { reto, codigo: e.codigo() }, headers: ip() })).json();
    return { authorization: `Bearer ${token}` };
  }

  /** Un anunciante registrado, con el correo verificado (o no) y la sesión abierta. */
  async function anunciante(op: { verificado?: boolean } = {}) {
    const email = `cliente${n++}@ejemplo.com`;
    await app.inject({ method: 'POST', url: '/v1/cuentas/registro', payload: { empresa: `Empresa ${n}`, pais: 'US', nombre: 'Ana', email, password: CLAVE }, headers: ip() });
    if (op.verificado !== false) {
      const [f] = await q<{ datos: { enlace: string } }>(`SELECT datos FROM outbox WHERE tipo = 'cuenta.registrada' AND datos->>'email' = $1`, [email]);
      const codigo = new URL(f!.datos.enlace).searchParams.get('codigo');
      await app.inject({ method: 'POST', url: '/v1/cuentas/verificar-correo', payload: { codigo }, headers: ip() });
    }
    const { token } = (await app.inject({ method: 'POST', url: '/v1/cuentas/ingresar', payload: { email, password: CLAVE }, headers: ip() })).json();
    const [u] = await q<{ anunciante_id: string }>(`SELECT anunciante_id FROM usuarios WHERE email = $1`, [email]);
    return { auth: { authorization: `Bearer ${token}` }, anuncianteId: u!.anunciante_id, email };
  }

  const cerrar = async () => {
    await app.close();
    await b.cerrar();
  };
  return { app, b, q, dueño, ip, miembroEquipo, sesionEquipo, anunciante, cerrar };
}
