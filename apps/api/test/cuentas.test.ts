import { afterAll, describe, expect, it } from 'vitest';
import { SesionAbierta, Yo } from '@sp/schemas';
import { CLAVE, montar } from './ayuda';

const m = await montar();
afterAll(() => m.cerrar());

const datos = (email: string) => ({ empresa: 'Acme Corp', pais: 'us', nombre: 'Ana Pérez', email, password: CLAVE });

async function registrar(email: string) {
  return m.app.inject({ method: 'POST', url: '/v1/cuentas/registro', payload: datos(email), headers: m.ip() });
}

/** El enlace queda en el outbox para el correo; de ahí lo saca la prueba. */
async function enlaceDe(email: string): Promise<string> {
  const [fila] = await m.q<{ datos: { enlace: string } }>(
    `SELECT datos FROM outbox WHERE tipo = 'cuenta.registrada' AND datos->>'email' = $1`,
    [email],
  );
  return new URL(fila!.datos.enlace).searchParams.get('codigo')!;
}

async function ingresar(email: string, password = CLAVE) {
  return m.app.inject({ method: 'POST', url: '/v1/cuentas/ingresar', payload: { email, password }, headers: m.ip() });
}

describe('registro', () => {
  it('crea anunciante, usuario, bitácora y el evento del correo en una sola operación', async () => {
    const r = await registrar('ana@acme.com');
    expect(r.statusCode).toBe(202);
    const [a] = await m.q<{ empresa: string; pais: string }>(
      `SELECT a.empresa, a.pais FROM anunciantes a JOIN usuarios u ON u.anunciante_id = a.id WHERE u.email = 'ana@acme.com'`,
    );
    expect(a).toEqual({ empresa: 'Acme Corp', pais: 'US' });
    expect(await enlaceDe('ana@acme.com')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const bit = await m.q(`SELECT 1 FROM bitacora WHERE accion = 'cuenta.registrada'`);
    expect(bit).toHaveLength(1);
  });

  it('responde igual si el correo ya existe, sin crear nada', async () => {
    const r = await registrar('ANA@acme.com');
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual((await registrar('nuevo@acme.com')).json());
    expect(await m.q(`SELECT 1 FROM anunciantes WHERE empresa = 'Acme Corp'`)).toHaveLength(2);
  });

  it('rechaza una clave débil y datos inválidos', async () => {
    const corta = await m.app.inject({ method: 'POST', url: '/v1/cuentas/registro', payload: { ...datos('x@y.com'), password: 'corta' }, headers: m.ip() });
    expect(corta.statusCode).toBe(400);
    const repetida = await m.app.inject({ method: 'POST', url: '/v1/cuentas/registro', payload: { ...datos('x@y.com'), password: 'aaaaaaaaaaaaaaa' }, headers: m.ip() });
    expect(repetida.json().error).toBe('clave_debil');
    const pais = await m.app.inject({ method: 'POST', url: '/v1/cuentas/registro', payload: { ...datos('x@y.com'), pais: 'Venezuela' }, headers: m.ip() });
    expect(pais.statusCode).toBe(400);
  });
});

describe('verificación de correo', () => {
  it('el enlace confirma el correo una sola vez', async () => {
    await registrar('beto@acme.com');
    const codigo = await enlaceDe('beto@acme.com');
    const r1 = await m.app.inject({ method: 'POST', url: '/v1/cuentas/verificar-correo', payload: { codigo }, headers: m.ip() });
    expect(r1.statusCode).toBe(200);
    const r2 = await m.app.inject({ method: 'POST', url: '/v1/cuentas/verificar-correo', payload: { codigo }, headers: m.ip() });
    expect(r2.statusCode).toBe(400);
    const [u] = await m.q<{ v: boolean }>(`SELECT correo_verificado_at IS NOT NULL AS v FROM usuarios WHERE email = 'beto@acme.com'`);
    expect(u!.v).toBe(true);
  });

  it('un código inventado no sirve', async () => {
    const r = await m.app.inject({ method: 'POST', url: '/v1/cuentas/verificar-correo', payload: { codigo: 'x'.repeat(43) }, headers: m.ip() });
    expect(r.statusCode).toBe(400);
  });
});

describe('ingreso y sesión', () => {
  it('entra con la clave correcta y ve solo sus datos', async () => {
    const r = await ingresar('ana@acme.com');
    expect(r.statusCode).toBe(200);
    const { token } = SesionAbierta.parse(r.json());
    const yo = await m.app.inject({ url: '/v1/cuentas/yo', headers: { authorization: `Bearer ${token}` } });
    expect(yo.statusCode).toBe(200);
    const y = Yo.parse(yo.json());
    expect(y.usuario).toMatchObject({ email: 'ana@acme.com', correoVerificado: false });
    expect(y.anunciante.empresa).toBe('Acme Corp');
    const [h] = await m.q<{ token_hash: Buffer }>(`SELECT token_hash FROM sesiones ORDER BY creada_at DESC LIMIT 1`);
    expect(Buffer.from(h!.token_hash).toString('base64url')).not.toBe(token);
  });

  it('clave incorrecta y correo inexistente dan el mismo error', async () => {
    const mala = await ingresar('ana@acme.com', 'Otra-clave-123');
    const nadie = await ingresar('nadie@acme.com');
    expect(mala.statusCode).toBe(401);
    expect(nadie.statusCode).toBe(401);
    expect(mala.json()).toEqual(nadie.json());
  });

  it('salir revoca el token', async () => {
    const { token } = (await ingresar('ana@acme.com')).json();
    const auth = { authorization: `Bearer ${token}` };
    expect((await m.app.inject({ method: 'POST', url: '/v1/cuentas/salir', headers: auth })).statusCode).toBe(204);
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: auth })).statusCode).toBe(401);
  });

  it('sin token, o con uno inventado, no hay acceso', async () => {
    expect((await m.app.inject({ url: '/v1/cuentas/yo' })).statusCode).toBe(401);
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: { authorization: `Bearer ${'a'.repeat(43)}` } })).statusCode).toBe(401);
  });

  it('una sesión vencida ya no sirve', async () => {
    const { token } = (await ingresar('ana@acme.com')).json();
    await m.q(`UPDATE sesiones SET expira_inactividad_at = now() - interval '1 minute' WHERE revocada_at IS NULL`);
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });

  it('un anunciante suspendido no entra', async () => {
    await m.q(`UPDATE anunciantes SET estado = 'suspendida' WHERE id = (SELECT anunciante_id FROM usuarios WHERE email = 'beto@acme.com')`);
    expect((await ingresar('beto@acme.com')).statusCode).toBe(401);
  });

  it('la sesión de un anunciante no abre el panel', async () => {
    const { token } = (await ingresar('ana@acme.com')).json();
    expect((await m.app.inject({ url: '/v1/panel/yo', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });
});

describe('límite de intentos', () => {
  it('frena el ingreso repetido desde una misma dirección', async () => {
    const l = await montar({ limiteAcceso: 3 });
    const ip = { 'x-forwarded-for': '10.1.1.1' };
    const codigos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await l.app.inject({ method: 'POST', url: '/v1/cuentas/ingresar', payload: { email: 'a@b.com', password: 'x' }, headers: ip });
      codigos.push(r.statusCode);
    }
    expect(codigos).toEqual([401, 401, 401, 429]);
    await l.cerrar();
  });
});
