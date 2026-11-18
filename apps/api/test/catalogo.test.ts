import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarParrilla, leerArchivoParrilla } from '@sp/catalogo';
import { Emisora, Parrilla } from '@sp/schemas';
import { montar } from './ayuda';

const m = await montar();
afterAll(() => m.cerrar());
const ARCHIVO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos/circuito-lider.yaml');

beforeAll(async () => {
  await m.dueño(() => cargarParrilla(m.b.db, leerArchivoParrilla(ARCHIVO)));
});

async function sesionEquipo(roles: string[]) {
  const e = await m.miembroEquipo(roles);
  const { reto } = (await m.app.inject({ method: 'POST', url: '/v1/panel/sesion', payload: { email: e.email, password: 'Clave-de-prueba-123' }, headers: m.ip() })).json();
  const { token } = (await m.app.inject({ method: 'POST', url: '/v1/panel/sesion/codigo', payload: { reto, codigo: e.codigo() }, headers: m.ip() })).json();
  return { authorization: `Bearer ${token}` };
}

const franjaDeEncendidosLunes = async () =>
  (await m.q<{ id: string }>(`SELECT f.id FROM franjas f JOIN programas p ON p.id = f.programa_id WHERE p.nombre = 'ENCENDIDOS' AND f.dia_semana = 1`))[0]!.id;

describe('catálogo público', () => {
  it('lista las diez emisoras sin sesión', async () => {
    const r = await m.app.inject('/v1/emisoras');
    expect(r.statusCode).toBe(200);
    expect(Emisora.array().parse(r.json())).toHaveLength(10);
    expect(r.headers['cache-control']).toBe('public, max-age=60');
  });

  it('devuelve la parrilla de una emisora', async () => {
    const r = await m.app.inject('/v1/parrilla?emisora=merida');
    const p = Parrilla.parse(r.json());
    expect(p.emisora.frecuencia).toBe('92.3 FM');
    expect(p.zonaHoraria).toBe('America/Caracas');
    expect(p.programas.map((x) => x.nombre)).toEqual(expect.arrayContaining(['El Brunch', 'Cambio de Luces', 'ENCENDIDOS']));
  });

  it('404 para una emisora que no existe y 400 para un nombre inválido', async () => {
    expect((await m.app.inject('/v1/parrilla?emisora=atlantis')).statusCode).toBe(404);
    expect((await m.app.inject("/v1/parrilla?emisora=x'%20or%201=1")).statusCode).toBe(400);
  });
});

describe('edición de franjas en el panel', () => {
  it('programación corrige los segundos de tanda, queda en la bitácora con el antes', async () => {
    const auth = await sesionEquipo(['programacion']);
    const id = await franjaDeEncendidosLunes();
    const r = await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: { segundosTanda: 600, cupoConfirmado: true } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ segundosTanda: 600, cupoConfirmado: true, inicio: '06:00', fin: '09:00' });
    const [b] = await m.q<{ datos: { antes: { segundos_tanda: number } } }>(`SELECT datos FROM bitacora WHERE accion = 'franja.editada' AND entidad_id = $1`, [id]);
    expect(b!.datos.antes.segundos_tanda).toBe(720);
  });

  it('una franja que deja de venderse desaparece del portal pero no del panel', async () => {
    const auth = await sesionEquipo(['gerencia']);
    const id = await franjaDeEncendidosLunes();
    await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: { activa: false } });
    const portal = Parrilla.parse((await m.app.inject('/v1/parrilla?emisora=caracas')).json());
    const panel = Parrilla.parse((await m.app.inject({ url: '/v1/panel/franjas?emisora=caracas', headers: auth })).json());
    const ids = (p: Parrilla) => p.programas.flatMap((x) => x.franjas.map((f) => f.id));
    expect(ids(portal)).not.toContain(id);
    expect(ids(panel)).toContain(id);
    await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: { activa: true } });
  });

  it('rechaza un horario al revés o datos de más', async () => {
    const auth = await sesionEquipo(['programacion']);
    const id = await franjaDeEncendidosLunes();
    const reves = await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: { inicio: '10:00', fin: '09:00' } });
    expect(reves.json().error).toBe('horario_invalido');
    const extra = await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: { programa_id: id } });
    expect(extra.statusCode).toBe(400);
    const vacio = await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: {} });
    expect(vacio.statusCode).toBe(400);
  });

  it('un revisor no puede editar la parrilla, y sin sesión tampoco', async () => {
    const auth = await sesionEquipo(['revisor']);
    const id = await franjaDeEncendidosLunes();
    expect((await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: { segundosTanda: 1 } })).statusCode).toBe(403);
    expect((await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, payload: { segundosTanda: 1 } })).statusCode).toBe(401);
  });

  it('el administrador puede todo', async () => {
    const auth = await sesionEquipo(['admin']);
    const id = await franjaDeEncendidosLunes();
    expect((await m.app.inject({ method: 'PUT', url: `/v1/panel/franjas/${id}`, headers: auth, payload: { segundosTanda: 610 } })).statusCode).toBe(200);
  });

  it('una franja que no existe da 404', async () => {
    const auth = await sesionEquipo(['programacion']);
    const r = await m.app.inject({ method: 'PUT', url: '/v1/panel/franjas/00000000-0000-4000-8000-000000000000', headers: auth, payload: { segundosTanda: 1 } });
    expect(r.statusCode).toBe(404);
  });
});
