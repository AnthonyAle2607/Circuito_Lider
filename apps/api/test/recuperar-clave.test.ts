import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { CLAVE, montar } from './ayuda';

const m = await montar();
afterAll(() => m.cerrar());

const pedir = (email: string) => m.app.inject({ method: 'POST', url: '/v1/cuentas/recuperar-clave', payload: { email }, headers: m.ip() });
const restablecer = (codigo: string, password: string) => m.app.inject({ method: 'POST', url: '/v1/cuentas/restablecer-clave', payload: { codigo, password }, headers: m.ip() });
const ingresar = (email: string, password: string) => m.app.inject({ method: 'POST', url: '/v1/cuentas/ingresar', payload: { email, password }, headers: m.ip() });
/** El código que viaja en el correo: se lee del evento del outbox, como lo haría n8n. */
const ultimoCodigo = async (email: string) => {
  const f = await m.q<{ datos: { enlace: string } }>(`SELECT datos FROM outbox WHERE tipo = 'cuenta.recuperar_clave' AND datos->>'email' = $1 ORDER BY id DESC LIMIT 1`, [email]);
  return f[0] ? new URL(f[0].datos.enlace).searchParams.get('codigo')! : null;
};
const NUEVA = 'Otra-clave-segura-456';

describe('recuperar la clave', () => {
  it('manda el enlace por el outbox, cambia la clave, cierra las sesiones y el enlace no sirve dos veces', async () => {
    const a = await m.anunciante();
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: a.auth })).statusCode).toBe(200);

    const r = await pedir(a.email);
    expect(r.statusCode).toBe(202);
    const codigo = (await ultimoCodigo(a.email))!;
    expect(codigo).toBeTruthy();
    // La base guarda solo el hash del código.
    const hash = createHash('sha256').update(codigo).digest('hex');
    expect(await m.q(`SELECT 1 FROM recuperaciones_clave WHERE encode(codigo_hash, 'hex') = $1`, [hash])).toHaveLength(1);

    expect((await restablecer(codigo, NUEVA)).statusCode).toBe(204);
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: a.auth })).statusCode).toBe(401);
    expect((await ingresar(a.email, CLAVE)).statusCode).toBe(401);
    expect((await ingresar(a.email, NUEVA)).statusCode).toBe(200);
    expect((await restablecer(codigo, 'Una-tercera-clave-789')).json()).toMatchObject({ error: 'enlace_invalido' });
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'clave.restablecida'`)).toHaveLength(1);
  });

  it('responde lo mismo para un correo que no existe y no deja rastro', async () => {
    const r = await pedir('nadie@ninguna-parte.com');
    expect(r.statusCode).toBe(202);
    expect(await ultimoCodigo('nadie@ninguna-parte.com')).toBeNull();
  });

  it('un código nuevo anula el anterior, y hay tope de 3 por hora', async () => {
    const a = await m.anunciante();
    await pedir(a.email);
    const primero = (await ultimoCodigo(a.email))!;
    await pedir(a.email);
    const segundo = (await ultimoCodigo(a.email))!;
    expect((await restablecer(primero, NUEVA)).statusCode).toBe(400);
    await pedir(a.email);
    await pedir(a.email); // cuarto en la hora: no crea código
    expect(await m.q(`SELECT 1 FROM recuperaciones_clave r JOIN usuarios u ON u.id = r.usuario_id WHERE u.email = $1`, [a.email])).toHaveLength(3);
    expect((await restablecer(segundo, NUEVA)).statusCode).toBe(400); // el tercero lo anuló
  });

  it('exige una clave que cumpla la política', async () => {
    const a = await m.anunciante();
    await pedir(a.email);
    expect((await restablecer((await ultimoCodigo(a.email))!, 'corta')).statusCode).toBe(400);
  });
});
