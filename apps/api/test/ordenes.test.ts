import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarParrilla, cargarTarifarioEjemplo, leerArchivoParrilla } from '@sp/catalogo';
import { diaIso, hoyEnCaracas, sumarDias } from '@sp/inventory';
import { OrdenDePauta, Pedido } from '@sp/schemas';
import { almacenEnMemoria } from '@sp/spots';
import { TERMINOS_POR_DEFECTO } from '../src/app';
import { montar } from './ayuda';

const almacen = almacenEnMemoria();
const m = await montar({ almacen });
afterAll(() => m.cerrar());
const DATOS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos');

const franja = async (programa: string) =>
  (await m.q<{ id: string }>(`SELECT f.id FROM franjas f JOIN programas p ON p.id = f.programa_id WHERE p.nombre = $1 AND f.dia_semana = 1`, [programa]))[0]!.id;
let lunes = '';
let emisoras = 0;
beforeAll(async () => {
  await m.dueño(async () => {
    await cargarParrilla(m.b.db, leerArchivoParrilla(`${DATOS}/circuito-lider.yaml`));
    await cargarTarifarioEjemplo(m.b.db, `${DATOS}/tarifario-ejemplo.yaml`);
  });
  lunes = sumarDias(hoyEnCaracas(), 1);
  while (diaIso(lunes) !== 1) lunes = sumarDias(lunes, 1);
  emisoras = Number((await m.q<{ n: string }>(`SELECT count(*) AS n FROM emisoras`))[0]!.n);
});

/** Un pedido pagado (ENCENDIDOS en cadena + Máximo Volumen local) con un anuncio aprobado asignado. */
async function pedidoPagadoConSpot() {
  const a = await m.anunciante();
  const emisiones = [{ franjaId: await franja('ENCENDIDOS'), fecha: lunes }, { franjaId: await franja('Máximo Volumen'), fecha: lunes }];
  const c = (await m.app.inject({ method: 'POST', url: '/v1/cotizaciones', payload: { duracionSegundos: 30, emisiones }, headers: m.ip() })).json();
  const p = Pedido.parse((await m.app.inject({ method: 'POST', url: `/v1/cotizaciones/${c.id}/reservar`, payload: { aceptaTerminos: true, terminosVersion: TERMINOS_POR_DEFECTO }, headers: a.auth })).json());
  const anuncio = async (nombre: string) => {
    const clave = `anuncios/${a.anuncianteId}/${nombre}.mp3`;
    await almacen.guardar(clave, Buffer.from(`audio ${nombre}`), 'audio/mpeg');
    const [x] = await m.q<{ id: string }>(
      `INSERT INTO anuncios (anunciante_id, subido_por, nombre, archivo_nombre, archivo_clave, formato, bytes, duracion_ms, estado)
       SELECT $1, u.id, $2, $2 || '.mp3', $3, 'mp3', 10, 30000, 'aprobado' FROM usuarios u WHERE u.anunciante_id = $1 RETURNING id`,
      [a.anuncianteId, nombre, clave],
    );
    return x!.id;
  };
  const spot = await anuncio('navidad');
  // Pago confirmado y spot asignado, como lo dejarían el aviso de la pasarela y el cliente.
  await m.q(`UPDATE pedidos SET estado = 'pagado', anuncio_id = $2 WHERE id = $1`, [p.id, spot]);
  await m.q(`UPDATE reservas SET estado = 'confirmada' WHERE pedido_id = $1`, [p.id]);
  return { a, p, spot, anuncio };
}
const generar = async () => {
  await m.b.comoWorker();
  try {
    return Number((await m.b.pg.query<{ n: number }>('select generar_ordenes() as n')).rows[0]!.n);
  } finally {
    await m.b.comoApi();
  }
};

describe('órdenes de pauta', () => {
  it('genera una orden por emisora (cadena en todas, local en la suya) y programación la carga', async () => {
    const { a, p } = await pedidoPagadoConSpot();
    expect(await generar()).toBe(emisoras);
    expect(await generar()).toBe(0); // no se duplican

    const revisor = await m.sesionEquipo(['revisor']);
    expect((await m.app.inject({ url: '/v1/panel/ordenes', headers: revisor })).statusCode).toBe(403);
    const prog = await m.sesionEquipo(['programacion']);
    const lista = OrdenDePauta.array().parse((await m.app.inject({ url: '/v1/panel/ordenes', headers: prog })).json()).filter((o) => o.pedidoId === p.id);
    expect(lista).toHaveLength(emisoras);
    const caracas = lista.find((o) => o.ciudad === 'Caracas')!;
    const otra = lista.find((o) => o.ciudad !== 'Caracas')!;
    expect(caracas.lineas.map((l) => l.programa).sort()).toEqual(['ENCENDIDOS', 'Máximo Volumen']);
    expect(otra.lineas.map((l) => l.programa)).toEqual(['ENCENDIDOS']);

    const spot = await m.app.inject({ url: `/v1/panel/ordenes/${caracas.id}/spot`, headers: prog });
    expect(spot.headers['content-disposition']).toContain('navidad.mp3');
    expect(spot.body).toBe('audio navidad');

    const ok = await m.app.inject({ method: 'POST', url: `/v1/panel/ordenes/${caracas.id}/cargada`, payload: { nota: 'Cargado en el sistema de pauta' }, headers: prog });
    expect(ok.json()).toEqual({ resultado: 'cargada' });
    expect((await m.app.inject({ method: 'POST', url: `/v1/panel/ordenes/${caracas.id}/cargada`, payload: {}, headers: prog })).statusCode).toBe(409);
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'orden.cargada' AND entidad_id = $1`, [caracas.id])).toHaveLength(1);

    const visto = Pedido.parse((await m.app.inject({ url: `/v1/pedidos/${p.id}`, headers: a.auth })).json());
    expect(visto.programacion).toEqual({ ordenes: emisoras, cargadas: 1 });
  });

  it('si el cliente cambia el anuncio, las órdenes viejas se anulan y salen otras', async () => {
    const { p, anuncio } = await pedidoPagadoConSpot();
    await generar();
    const prog = await m.sesionEquipo(['programacion']);
    const vieja = OrdenDePauta.array().parse((await m.app.inject({ url: '/v1/panel/ordenes', headers: prog })).json()).find((o) => o.pedidoId === p.id)!;
    await m.q(`UPDATE pedidos SET anuncio_id = $2 WHERE id = $1`, [p.id, await anuncio('verano')]);
    expect(await generar()).toBe(emisoras);
    const anuladas = await m.q(`SELECT 1 FROM ordenes_pauta WHERE pedido_id = $1 AND estado = 'anulada'`, [p.id]);
    expect(anuladas).toHaveLength(emisoras);
    expect((await m.app.inject({ method: 'POST', url: `/v1/panel/ordenes/${vieja.id}/cargada`, payload: {}, headers: prog })).json()).toMatchObject({ error: 'orden_anulada' });
  });

  it('un pedido sin pagar o con el spot sin aprobar no genera órdenes', async () => {
    const { p } = await pedidoPagadoConSpot();
    await m.q(`UPDATE pedidos SET estado = 'reservado' WHERE id = $1`, [p.id]);
    expect(await m.q(`SELECT 1 FROM ordenes_pauta WHERE pedido_id = $1`, [p.id])).toHaveLength(0);
    await generar();
    expect(await m.q(`SELECT 1 FROM ordenes_pauta WHERE pedido_id = $1`, [p.id])).toHaveLength(0);
  });
});
