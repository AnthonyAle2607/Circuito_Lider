import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarParrilla, cargarTarifarioEjemplo, leerArchivoParrilla } from '@sp/catalogo';
import { diaIso, hoyEnCaracas, sumarDias } from '@sp/inventory';
import { Cotizacion, ResumenPanel, Yo } from '@sp/schemas';
import { TERMINOS_POR_DEFECTO } from '../src/app';
import { CLAVE, montar } from './ayuda';

const m = await montar();
afterAll(() => m.cerrar());
const DATOS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos');

function proximo(dia: number, semanas = 0): string {
  let f = sumarDias(hoyEnCaracas(), 1);
  while (diaIso(f) !== dia) f = sumarDias(f, 1);
  return sumarDias(f, semanas * 7);
}
let maximoLunes = '';
let encendidosMartes = '';

beforeAll(async () => {
  await m.dueño(async () => {
    await cargarParrilla(m.b.db, leerArchivoParrilla(`${DATOS}/circuito-lider.yaml`));
    await cargarTarifarioEjemplo(m.b.db, `${DATOS}/tarifario-ejemplo.yaml`);
  });
  const franja = async (programa: string, dia: number) =>
    (await m.q<{ id: string }>(`SELECT f.id FROM franjas f JOIN programas p ON p.id = f.programa_id WHERE p.nombre = $1 AND f.dia_semana = $2`, [programa, dia]))[0]!.id;
  maximoLunes = await franja('Máximo Volumen', 1);
  encendidosMartes = await franja('ENCENDIDOS', 2);
});

const yo = async (auth: Record<string, string>) => Yo.parse((await m.app.inject({ url: '/v1/cuentas/yo', headers: auth })).json());
const resumen = async (auth: Record<string, string>) => ResumenPanel.parse((await m.app.inject({ url: '/v1/cuentas/resumen', headers: auth })).json());

describe('resumen del panel', () => {
  it('una cuenta nueva no tiene nada en curso', async () => {
    const a = await m.anunciante();
    expect(await resumen(a.auth)).toEqual({
      campanasActivas: 0,
      emisionesPorSonar: 0,
      porPagar: { pedidos: 0, totalCentimos: 0, moneda: null, venceAt: null },
      proximas: [],
    });
  });

  it('cuenta lo reservado y ordena las próximas emisiones; no ve las de otra cuenta', async () => {
    const a = await m.anunciante();
    const otro = await m.anunciante();
    const c = Cotizacion.parse(
      (
        await m.app.inject({
          method: 'POST',
          url: '/v1/cotizaciones',
          headers: m.ip(),
          payload: { duracionSegundos: 30, emisiones: [{ franjaId: encendidosMartes, fecha: proximo(2, 1) }, { franjaId: maximoLunes, fecha: proximo(1, 1) }] },
        })
      ).json(),
    );
    const r = await m.app.inject({
      method: 'POST',
      url: `/v1/cotizaciones/${c.id}/reservar`,
      headers: a.auth,
      payload: { aceptaTerminos: true, terminosVersion: TERMINOS_POR_DEFECTO },
    });
    expect(r.statusCode).toBe(201);

    const s = await resumen(a.auth);
    expect(s).toMatchObject({ campanasActivas: 1, emisionesPorSonar: 2, porPagar: { pedidos: 1, totalCentimos: c.totalCentimos, moneda: 'USD' } });
    expect(s.porPagar.venceAt).not.toBeNull();
    // Ordenadas por fecha. Cuál va primero depende del día en que corre la prueba (un lunes, el martes llega antes).
    const esperadas = [
      [proximo(1, 1), 'Máximo Volumen', 'Caracas'],
      [proximo(2, 1), 'ENCENDIDOS', 'En cadena nacional'],
    ].sort((x, y) => x[0]!.localeCompare(y[0]!));
    expect(s.proximas.map((x) => [x.fecha, x.programa, x.donde])).toEqual(esperadas);
    expect((await resumen(otro.auth)).campanasActivas).toBe(0);
  });

  it('sin sesión no responde', async () => {
    expect((await m.app.inject('/v1/cuentas/resumen')).statusCode).toBe(401);
  });
});

describe('datos de la empresa', () => {
  it('se guardan, los vacíos quedan sin dato y queda en la bitácora', async () => {
    const a = await m.anunciante();
    const r = await m.app.inject({
      method: 'PUT',
      url: '/v1/cuentas/empresa',
      headers: a.auth,
      payload: { empresa: 'Acme Media LLC', pais: 'us', zonaHoraria: 'America/New_York', idFiscal: '12-3456789', sector: 'Bebidas', sitioWeb: '', telefono: ' +1 305 555 0100 ' },
    });
    expect(r.statusCode).toBe(204);
    expect((await yo(a.auth)).anunciante).toMatchObject({
      empresa: 'Acme Media LLC',
      pais: 'US',
      zonaHoraria: 'America/New_York',
      idFiscal: '12-3456789',
      sector: 'Bebidas',
      sitioWeb: null,
      telefono: '+1 305 555 0100',
      direccion: null,
    });
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'cuenta.empresa_actualizada' AND anunciante_id = $1`, [a.anuncianteId])).toHaveLength(1);
  });

  it('rechaza datos inválidos', async () => {
    const a = await m.anunciante();
    const r = await m.app.inject({ method: 'PUT', url: '/v1/cuentas/empresa', headers: a.auth, payload: { empresa: '', pais: 'Estados Unidos', zonaHoraria: 'X' } });
    expect(r.statusCode).toBe(400);
  });

  it('solo cambia la propia cuenta', async () => {
    const a = await m.anunciante();
    const b = await m.anunciante();
    const antes = (await yo(b.auth)).anunciante.empresa;
    await m.app.inject({ method: 'PUT', url: '/v1/cuentas/empresa', headers: a.auth, payload: { empresa: 'Cambiada', pais: 'MX', zonaHoraria: 'America/Mexico_City' } });
    expect((await yo(b.auth)).anunciante.empresa).toBe(antes);
  });
});

describe('perfil y clave', () => {
  it('cambia el nombre', async () => {
    const a = await m.anunciante();
    expect((await m.app.inject({ method: 'PUT', url: '/v1/cuentas/perfil', headers: a.auth, payload: { nombre: 'Ana María' } })).statusCode).toBe(204);
    expect((await yo(a.auth)).usuario.nombre).toBe('Ana María');
  });

  it('cambia la clave con la actual, cierra las otras sesiones y deja entrar con la nueva', async () => {
    const a = await m.anunciante();
    const otra = (await m.app.inject({ method: 'POST', url: '/v1/cuentas/ingresar', payload: { email: a.email, password: CLAVE }, headers: m.ip() })).json();
    const otraAuth = { authorization: `Bearer ${otra.token}` };

    const mal = await m.app.inject({ method: 'POST', url: '/v1/cuentas/clave', headers: a.auth, payload: { actual: 'no-es-esta-clave', nueva: 'Otra-clave-segura-456' } });
    expect(mal.json().error).toBe('clave_actual');

    const ok = await m.app.inject({ method: 'POST', url: '/v1/cuentas/clave', headers: a.auth, payload: { actual: CLAVE, nueva: 'Otra-clave-segura-456' } });
    expect(ok.statusCode).toBe(204);
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: a.auth })).statusCode).toBe(200);
    expect((await m.app.inject({ url: '/v1/cuentas/yo', headers: otraAuth })).statusCode).toBe(401);

    const vieja = await m.app.inject({ method: 'POST', url: '/v1/cuentas/ingresar', payload: { email: a.email, password: CLAVE }, headers: m.ip() });
    expect(vieja.statusCode).toBe(401);
    const nueva = await m.app.inject({ method: 'POST', url: '/v1/cuentas/ingresar', payload: { email: a.email, password: 'Otra-clave-segura-456' }, headers: m.ip() });
    expect(nueva.statusCode).toBe(200);
  });

  it('rechaza una clave nueva débil', async () => {
    const a = await m.anunciante();
    const r = await m.app.inject({ method: 'POST', url: '/v1/cuentas/clave', headers: a.auth, payload: { actual: CLAVE, nueva: 'corta' } });
    expect(r.statusCode).toBe(400);
  });
});
