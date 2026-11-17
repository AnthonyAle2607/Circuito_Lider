import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarParrilla, cargarTarifarioEjemplo, leerArchivoParrilla } from '@sp/catalogo';
import { diaIso, hoyEnCaracas, sumarDias } from '@sp/inventory';
import { Cotizacion, Disponible, Pedido } from '@sp/schemas';
import { TERMINOS_POR_DEFECTO } from '../src/app';
import { montar } from './ayuda';

const m = await montar();
afterAll(() => m.cerrar());
const DATOS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos');
const TERMINOS = { aceptaTerminos: true, terminosVersion: TERMINOS_POR_DEFECTO };

/** El próximo día ISO pedido, desde mañana (hora de Caracas), más `semanas` semanas. */
function proximo(dia: number, semanas = 0): string {
  let f = sumarDias(hoyEnCaracas(), 1);
  while (diaIso(f) !== dia) f = sumarDias(f, 1);
  return sumarDias(f, semanas * 7);
}
const franja = async (programa: string, dia: number) =>
  (await m.q<{ id: string }>(`SELECT f.id FROM franjas f JOIN programas p ON p.id = f.programa_id WHERE p.nombre = $1 AND f.dia_semana = $2`, [programa, dia]))[0]!.id;

let encendidosLunes = '';
let maximoLunes = '';

beforeAll(async () => {
  await m.dueño(async () => {
    await cargarParrilla(m.b.db, leerArchivoParrilla(`${DATOS}/circuito-lider.yaml`));
    await cargarTarifarioEjemplo(m.b.db, `${DATOS}/tarifario-ejemplo.yaml`);
  });
  encendidosLunes = await franja('ENCENDIDOS', 1);
  maximoLunes = await franja('Máximo Volumen', 1);
});

const cotizar = (payload: Record<string, unknown>) => m.app.inject({ method: 'POST', url: '/v1/cotizaciones', payload, headers: m.ip() });
const reservar = (id: string, auth: Record<string, string>, payload: Record<string, unknown> = TERMINOS) =>
  m.app.inject({ method: 'POST', url: `/v1/cotizaciones/${id}/reservar`, payload, headers: auth });

describe('disponibilidad', () => {
  it('muestra los segundos libres de cada franja día por día', async () => {
    const r = await m.app.inject(`/v1/disponibilidad?emisora=caracas&desde=${proximo(1)}&dias=7`);
    const d = Disponible.array().parse(r.json());
    const enc = d.find((x) => x.programa === 'ENCENDIDOS' && x.fecha === proximo(1))!;
    expect(enc).toMatchObject({ capacidad: 720, libres: 720, alcance: 'nacional', cupoConfirmado: false });
    expect(d.every((x) => diaIso(x.fecha) >= 1)).toBe(true);
  });

  it('publica el tarifario vigente para que el portal muestre el precio mientras se elige', async () => {
    const r = await m.app.inject('/v1/tarifario');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ version: 1, moneda: 'USD', esEjemplo: true, duraciones: [30, 45, 60] });
  });
});

describe('cotizar', () => {
  it('calcula con el tarifario de ejemplo y lo dice', async () => {
    const r = await cotizar({ duracionSegundos: 30, emisiones: [{ franjaId: encendidosLunes, fecha: proximo(1) }, { franjaId: maximoLunes, fecha: proximo(1) }] });
    expect(r.statusCode).toBe(201);
    const c = Cotizacion.parse(r.json());
    expect(c).toMatchObject({ estado: 'vigente', esEjemplo: true, moneda: 'USD', subtotalCentimos: 7500, totalCentimos: 7500, requiereAprobacion: false });
    expect(c.lineas.map((l) => l.donde).sort()).toEqual(['Caracas', 'En cadena nacional']);
    expect(Cotizacion.parse((await m.app.inject(`/v1/cotizaciones/${c.id}`)).json()).totalCentimos).toBe(7500);
  });

  it('aplica el descuento por volumen', async () => {
    const emisiones = Array.from({ length: 20 }, (_, i) => ({ franjaId: maximoLunes, fecha: proximo(1, i) }));
    const c = Cotizacion.parse((await cotizar({ duracionSegundos: 30, emisiones })).json());
    expect(c.subtotalCentimos).toBe(30_000);
    expect(c.descuentoCentimos).toBe(1500);
    expect(c.totalCentimos).toBe(28_500);
  });

  it.each([
    ['un día en que la franja no suena', () => ({ duracionSegundos: 30, emisiones: [{ franjaId: encendidosLunes, fecha: proximo(2) }] }), 'dia_incorrecto'],
    ['hoy o una fecha pasada', () => ({ duracionSegundos: 30, emisiones: [{ franjaId: encendidosLunes, fecha: hoyEnCaracas() }] }), 'fecha_fuera_de_rango'],
    ['emisiones repetidas', () => ({ duracionSegundos: 30, emisiones: [{ franjaId: maximoLunes, fecha: proximo(1) }, { franjaId: maximoLunes, fecha: proximo(1) }] }), 'emisiones_repetidas'],
    ['una duración sin precio', () => ({ duracionSegundos: 20, emisiones: [{ franjaId: maximoLunes, fecha: proximo(1) }] }), 'duracion_sin_precio'],
    ['una franja que no existe', () => ({ duracionSegundos: 30, emisiones: [{ franjaId: '00000000-0000-4000-8000-000000000000', fecha: proximo(1) }] }), 'franja_invalida'],
  ])('rechaza %s', async (_n, payload, error) => {
    const r = await cotizar(payload());
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe(error);
  });
});

describe('reservar', () => {
  async function cotizacionSimple(fecha = proximo(1, 3)) {
    return Cotizacion.parse((await cotizar({ duracionSegundos: 30, emisiones: [{ franjaId: maximoLunes, fecha }] })).json());
  }

  it('reserva con cuenta verificada: crea el pedido, retiene el cupo y deja constancia', async () => {
    const a = await m.anunciante();
    const c = await cotizacionSimple();
    const r = await reservar(c.id, a.auth);
    expect(r.statusCode).toBe(201);
    const p = Pedido.parse(r.json());
    expect(p).toMatchObject({ estado: 'reservado', totalCentimos: 1500, cotizacionId: c.id });
    expect(p.reservas).toEqual([{ franjaId: maximoLunes, fecha: proximo(1, 3), segundos: 30, estado: 'retenida' }]);
    const [cupo] = await m.q<{ segundos_usados: number }>(`SELECT segundos_usados FROM cupos WHERE franja_id = $1 AND fecha = $2`, [maximoLunes, proximo(1, 3)]);
    expect(cupo!.segundos_usados).toBe(30);
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'pedido.reservado' AND entidad_id = $1`, [p.id])).toHaveLength(1);
    expect((await reservar(c.id, a.auth)).json().error).toBe('ya_reservada');
    expect(Cotizacion.parse((await m.app.inject(`/v1/cotizaciones/${c.id}`)).json()).estado).toBe('reservada');
  });

  it('pide sesión, correo verificado y los términos vigentes', async () => {
    const c = await cotizacionSimple(proximo(1, 4));
    expect((await reservar(c.id, {})).statusCode).toBe(401);
    const sinVerificar = await m.anunciante({ verificado: false });
    expect((await reservar(c.id, sinVerificar.auth)).json().error).toBe('correo_sin_verificar');
    const a = await m.anunciante();
    expect((await reservar(c.id, a.auth, { aceptaTerminos: true, terminosVersion: 'vieja' })).json().error).toBe('terminos_cambiaron');
    expect((await reservar(c.id, a.auth, { aceptaTerminos: false, terminosVersion: TERMINOS_POR_DEFECTO })).statusCode).toBe(400);
  });

  it('otro anunciante no ve el pedido', async () => {
    const a = await m.anunciante();
    const p = Pedido.parse((await reservar((await cotizacionSimple(proximo(1, 5))).id, a.auth)).json());
    const b = await m.anunciante();
    expect((await m.app.inject({ url: `/v1/pedidos/${p.id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await m.app.inject({ url: '/v1/pedidos', headers: b.auth })).json()).toEqual([]);
    expect((await m.app.inject({ url: '/v1/pedidos', headers: a.auth })).json()).toHaveLength(1);
  });

  it('si otro reservó antes el último cupo, no se reserva nada y se dice cuál falta', async () => {
    await m.dueño(() => m.b.pg.query(`UPDATE franjas SET segundos_tanda = 30 WHERE id = $1`, [encendidosLunes]));
    const fecha = proximo(1, 6);
    const emisiones = [{ franjaId: maximoLunes, fecha }, { franjaId: encendidosLunes, fecha }];
    const c1 = Cotizacion.parse((await cotizar({ duracionSegundos: 30, emisiones: [emisiones[1]] })).json());
    const c2 = Cotizacion.parse((await cotizar({ duracionSegundos: 30, emisiones })).json());
    expect((await reservar(c1.id, (await m.anunciante()).auth)).statusCode).toBe(201);
    const r = await reservar(c2.id, (await m.anunciante()).auth);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ error: 'sin_cupo', faltantes: [{ franjaId: encendidosLunes, fecha }] });
    const [cupoMaximo] = await m.q<{ s: number }>(`SELECT coalesce(sum(segundos_usados), 0)::int AS s FROM cupos WHERE franja_id = $1 AND fecha = $2`, [maximoLunes, fecha]);
    expect(cupoMaximo!.s).toBe(0);
    expect((await cotizar({ duracionSegundos: 30, emisiones: [emisiones[1]] })).json().error).toBe('sin_cupo');
    await m.dueño(() => m.b.pg.query(`UPDATE franjas SET segundos_tanda = 720 WHERE id = $1`, [encendidosLunes]));
  });

  it('una cotización vencida no se reserva', async () => {
    const c = await cotizacionSimple(proximo(1, 7));
    await m.q(`UPDATE cotizaciones SET vence_at = now() - interval '1 minute' WHERE id = $1`, [c.id]);
    expect(Cotizacion.parse((await m.app.inject(`/v1/cotizaciones/${c.id}`)).json()).estado).toBe('vencida');
    expect((await reservar(c.id, (await m.anunciante()).auth)).statusCode).toBe(410);
  });
});

describe('cancelar y vencer', () => {
  it('cancelar devuelve el cupo; no se cancela dos veces', async () => {
    const a = await m.anunciante();
    const fecha = proximo(1, 8);
    const c = Cotizacion.parse((await cotizar({ duracionSegundos: 60, emisiones: [{ franjaId: maximoLunes, fecha }] })).json());
    const p = Pedido.parse((await reservar(c.id, a.auth)).json());
    const r = await m.app.inject({ method: 'POST', url: `/v1/pedidos/${p.id}/cancelar`, headers: a.auth });
    expect(Pedido.parse(r.json())).toMatchObject({ estado: 'cancelado', reservas: [{ estado: 'liberada' }] });
    const [cupo] = await m.q<{ segundos_usados: number }>(`SELECT segundos_usados FROM cupos WHERE franja_id = $1 AND fecha = $2`, [maximoLunes, fecha]);
    expect(cupo!.segundos_usados).toBe(0);
    expect((await m.app.inject({ method: 'POST', url: `/v1/pedidos/${p.id}/cancelar`, headers: a.auth })).statusCode).toBe(409);
  });

  it('el trabajo de vencimiento libera las reservas sin pagar cuyo plazo pasó (con el rol de los trabajos)', async () => {
    const a = await m.anunciante();
    const fecha = proximo(1, 9);
    const c = Cotizacion.parse((await cotizar({ duracionSegundos: 45, emisiones: [{ franjaId: maximoLunes, fecha }] })).json());
    const p = Pedido.parse((await reservar(c.id, a.auth)).json());
    await m.q(`UPDATE pedidos SET reserva_vence_at = now() - interval '1 minute' WHERE id = $1`, [p.id]);
    await m.b.comoWorker();
    const { rows } = await m.b.pg.query<{ n: number }>('select liberar_reservas_vencidas() as n');
    await m.b.comoApi();
    expect(rows[0]!.n).toBe(1);
    const visto = Pedido.parse((await m.app.inject({ url: `/v1/pedidos/${p.id}`, headers: a.auth })).json());
    expect(visto).toMatchObject({ estado: 'vencido', reservas: [{ estado: 'liberada' }] });
    const [cupo] = await m.q<{ segundos_usados: number }>(`SELECT segundos_usados FROM cupos WHERE franja_id = $1 AND fecha = $2`, [maximoLunes, fecha]);
    expect(cupo!.segundos_usados).toBe(0);
    expect(await m.q(`SELECT 1 FROM outbox WHERE tipo = 'pedido.vencido' AND datos->>'pedido_id' = $1`, [p.id])).toHaveLength(1);
  });
});

describe('aprobación de ventas', () => {
  /** 60 emisiones de 60 s en cadena: USD 6.000 − 10 % = USD 5.400, sobre el umbral de USD 5.000. */
  const grande = () => ({
    duracionSegundos: 60,
    emisiones: Array.from({ length: 12 }, (_, s) => [1, 2, 3, 4, 5].map((d) => ({ dia: d, s }))).flat(),
  });
  async function cotizacionGrande() {
    const ids = new Map<number, string>();
    for (const d of [1, 2, 3, 4, 5]) ids.set(d, await franja('ENCENDIDOS', d));
    const g = grande();
    const r = await cotizar({ duracionSegundos: g.duracionSegundos, emisiones: g.emisiones.map((e) => ({ franjaId: ids.get(e.dia)!, fecha: proximo(e.dia, e.s + 10) })) });
    return Cotizacion.parse(r.json());
  }

  it('sobre el umbral espera a ventas; aprobada, se reserva', async () => {
    const c = await cotizacionGrande();
    expect(c).toMatchObject({ estado: 'en_aprobacion', requiereAprobacion: true, totalCentimos: 540_000 });
    const a = await m.anunciante();
    expect((await reservar(c.id, a.auth)).json().error).toBe('pendiente_aprobacion');
    const ventas = await m.sesionEquipo(['ventas']);
    const lista = (await m.app.inject({ url: '/v1/panel/aprobaciones', headers: ventas })).json() as Array<{ id: string }>;
    expect(lista.map((x) => x.id)).toContain(c.id);
    const r = await m.app.inject({ method: 'POST', url: `/v1/panel/aprobaciones/${c.id}`, headers: ventas, payload: { decision: 'aprobar', motivo: 'Cliente conocido' } });
    expect(Cotizacion.parse(r.json()).estado).toBe('vigente');
    expect((await reservar(c.id, a.auth)).statusCode).toBe(201);
  });

  it('rechazada no se reserva; un revisor no puede decidir', async () => {
    const c = await cotizacionGrande();
    const revisor = await m.sesionEquipo(['revisor']);
    expect((await m.app.inject({ method: 'POST', url: `/v1/panel/aprobaciones/${c.id}`, headers: revisor, payload: { decision: 'aprobar', motivo: 'x x x' } })).statusCode).toBe(403);
    const ventas = await m.sesionEquipo(['gerencia']);
    await m.app.inject({ method: 'POST', url: `/v1/panel/aprobaciones/${c.id}`, headers: ventas, payload: { decision: 'rechazar', motivo: 'Fuera de política' } });
    expect((await reservar(c.id, (await m.anunciante()).auth)).json().error).toBe('cotizacion_no_reservable');
    expect((await m.app.inject({ method: 'POST', url: `/v1/panel/aprobaciones/${c.id}`, headers: ventas, payload: { decision: 'aprobar', motivo: 'Cambio de idea' } })).statusCode).toBe(409);
  });
});

describe('tarifario versionado', () => {
  it('una versión nueva cambia los precios nuevos pero no los ya cotizados (P4)', async () => {
    const fecha = proximo(1, 20);
    const vieja = Cotizacion.parse((await cotizar({ duracionSegundos: 30, emisiones: [{ franjaId: maximoLunes, fecha }] })).json());
    const gerencia = await m.sesionEquipo(['gerencia']);
    const v2 = await m.app.inject({
      method: 'PUT',
      url: '/v1/panel/tarifario',
      headers: gerencia,
      payload: {
        moneda: 'USD',
        vigencia_cotizacion_horas: 72,
        reserva_horas: 24,
        umbral_aprobacion_centimos: 500000,
        tarifas: [
          { alcance: 'nacional', duracion_segundos: 30, precio_centimos: 7000 },
          { alcance: 'local', duracion_segundos: 30, precio_centimos: 1800 },
        ],
      },
    });
    expect(v2.statusCode).toBe(201);
    expect(v2.json().version).toBe(2);
    const nueva = Cotizacion.parse((await cotizar({ duracionSegundos: 30, emisiones: [{ franjaId: maximoLunes, fecha }] })).json());
    expect(nueva).toMatchObject({ totalCentimos: 1800, tarifarioVersion: 2, esEjemplo: false });
    expect(Cotizacion.parse((await m.app.inject(`/v1/cotizaciones/${vieja.id}`)).json())).toMatchObject({ totalCentimos: 1500, tarifarioVersion: 1 });
    await expect(m.q(`UPDATE tarifas SET precio_centimos = 1 WHERE alcance = 'local'`)).rejects.toThrow(/solo añadir/);
  });

  it('ventas no publica tarifarios: solo gerencia', async () => {
    const ventas = await m.sesionEquipo(['ventas']);
    expect((await m.app.inject({ method: 'PUT', url: '/v1/panel/tarifario', headers: ventas, payload: {} })).statusCode).toBe(403);
  });
});
