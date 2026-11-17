import { afterAll, describe, expect, it } from 'vitest';
import { YoEquipo } from '@sp/schemas';
import { CLAVE, montar } from './ayuda';

const m = await montar();
afterAll(() => m.cerrar());

async function paso1(email: string, password = CLAVE) {
  return m.app.inject({ method: 'POST', url: '/v1/panel/sesion', payload: { email, password }, headers: m.ip() });
}
async function paso2(reto: string, codigo: string) {
  return m.app.inject({ method: 'POST', url: '/v1/panel/sesion/codigo', payload: { reto, codigo }, headers: m.ip() });
}

describe('ingreso del equipo con doble factor', () => {
  it('clave + código abren la sesión y el panel', async () => {
    const e = await m.miembroEquipo(['revisor']);
    const { reto } = (await paso1(e.email)).json();
    const r = await paso2(reto, e.codigo());
    expect(r.statusCode).toBe(200);
    expect(r.json().roles).toEqual(['revisor']);
    const yo = await m.app.inject({ url: '/v1/panel/yo', headers: { authorization: `Bearer ${r.json().token}` } });
    expect(YoEquipo.parse(yo.json())).toMatchObject({ email: e.email, roles: ['revisor'] });
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'equipo.sesion_iniciada' AND entidad_id = $1`, [e.id])).toHaveLength(1);
  });

  it('la clave sola no da sesión: el primer paso solo entrega un reto', async () => {
    const e = await m.miembroEquipo();
    const r = await paso1(e.email);
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json())).toEqual(['reto']);
  });

  it('un código equivocado no entra', async () => {
    const e = await m.miembroEquipo();
    const { reto } = (await paso1(e.email)).json();
    const malo = e.codigo() === '000000' ? '111111' : '000000';
    expect((await paso2(reto, malo)).statusCode).toBe(401);
  });

  it('el mismo código no sirve dos veces', async () => {
    const e = await m.miembroEquipo();
    const codigo = e.codigo();
    const r1 = await paso2((await paso1(e.email)).json().reto, codigo);
    expect(r1.statusCode).toBe(200);
    const r2 = await paso2((await paso1(e.email)).json().reto, codigo);
    expect(r2.statusCode).toBe(401);
  });

  it('el reto admite pocos intentos', async () => {
    const e = await m.miembroEquipo();
    const { reto } = (await paso1(e.email)).json();
    for (let i = 0; i < 5; i++) await paso2(reto, '000000');
    const r = await paso2(reto, e.codigo());
    expect(r.json().error).toBe('reto_vencido');
  });

  it('clave incorrecta o correo inexistente dan el mismo error', async () => {
    const e = await m.miembroEquipo();
    const mala = await paso1(e.email, 'Otra-clave-123');
    const nadie = await paso1('nadie@invermedia.com');
    expect(mala.statusCode).toBe(401);
    expect(mala.json()).toEqual(nadie.json());
  });

  it('un miembro desactivado pierde el acceso, aun con sesión abierta', async () => {
    const e = await m.miembroEquipo();
    const { token } = (await paso2((await paso1(e.email)).json().reto, e.codigo())).json();
    await m.q(`UPDATE equipo SET activo = false WHERE id = $1`, [e.id]);
    expect((await m.app.inject({ url: '/v1/panel/yo', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    expect((await paso1(e.email)).statusCode).toBe(401);
  });

  it('la sesión del equipo no sirve como anunciante', async () => {
    const e = await m.miembroEquipo();
    const { token } = (await paso2((await paso1(e.email)).json().reto, e.codigo())).json();
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });

  it('salir cierra la sesión del equipo', async () => {
    const e = await m.miembroEquipo();
    const { token } = (await paso2((await paso1(e.email)).json().reto, e.codigo())).json();
    const auth = { authorization: `Bearer ${token}` };
    expect((await m.app.inject({ method: 'POST', url: '/v1/panel/sesion/salir', headers: auth })).statusCode).toBe(204);
    expect((await m.app.inject({ url: '/v1/panel/yo', headers: auth })).statusCode).toBe(401);
  });
});
