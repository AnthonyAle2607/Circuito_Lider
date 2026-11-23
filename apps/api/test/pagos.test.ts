import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarParrilla, cargarTarifarioEjemplo, leerArchivoParrilla } from '@sp/catalogo';
import { diaIso, hoyEnCaracas, sumarDias } from '@sp/inventory';
import { CABECERA_FIRMA, almacenEnMemoria, firmar, pasarelaDePrueba } from '@sp/payments';
import { Pago, Pedido, SesionDePago, TransferenciaPorRevisar } from '@sp/schemas';
import { almacenEnMemoria as almacenArchivos } from '@sp/spots';
import { TERMINOS_POR_DEFECTO } from '../src/app';
import { montar } from './ayuda';

const SECRETO = 'secreto-de-la-pasarela-de-prueba-0123456789';
const pasarela = pasarelaDePrueba({ secreto: SECRETO, urlPagina: (r) => `https://api.prueba/v1/pasarela-prueba/${r}`, almacen: almacenEnMemoria() });
const archivos = almacenArchivos();
const DATOS_BANCO = { titular: 'Invermedia', banco: 'Banco de ejemplo', cuenta: '0000', moneda: 'USD', nota: 'Pon el pedido en el concepto.', esEjemplo: true };
const m = await montar({ pasarela, almacen: archivos, transferencia: { datos: DATOS_BANCO, maximoBytes: 1024 * 1024 } });
afterAll(() => m.cerrar());
const DATOS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos');
const PDF = Buffer.from('%PDF-1.4 comprobante de prueba');

let encendidos = '';
beforeAll(async () => {
  await m.dueño(async () => {
    await cargarParrilla(m.b.db, leerArchivoParrilla(`${DATOS}/circuito-lider.yaml`));
    await cargarTarifarioEjemplo(m.b.db, `${DATOS}/tarifario-ejemplo.yaml`);
  });
  encendidos = (await m.q<{ id: string }>(`SELECT f.id FROM franjas f JOIN programas p ON p.id = f.programa_id WHERE p.nombre = 'ENCENDIDOS' AND f.dia_semana = 1`))[0]!.id;
});

let semana = 0;
/** Un anunciante con un pedido reservado (una emisión de ENCENDIDOS en un lunes distinto cada vez). */
async function pedidoReservado() {
  let f = sumarDias(hoyEnCaracas(), 1);
  while (diaIso(f) !== 1) f = sumarDias(f, 1);
  const fecha = sumarDias(f, 7 * semana++);
  const a = await m.anunciante();
  const c = (await m.app.inject({ method: 'POST', url: '/v1/cotizaciones', payload: { duracionSegundos: 30, emisiones: [{ franjaId: encendidos, fecha }] }, headers: m.ip() })).json();
  const p = Pedido.parse((await m.app.inject({ method: 'POST', url: `/v1/cotizaciones/${c.id}/reservar`, payload: { aceptaTerminos: true, terminosVersion: TERMINOS_POR_DEFECTO }, headers: a.auth })).json());
  return { a, p };
}
const pagar = (id: string, auth: Record<string, string>) => m.app.inject({ method: 'POST', url: `/v1/pedidos/${id}/pagar`, headers: auth });
const leer = async (id: string, auth: Record<string, string>) => Pedido.parse((await m.app.inject({ url: `/v1/pedidos/${id}`, headers: auth })).json());
const avisar = (cuerpo: string, firma: string) =>
  m.app.inject({ method: 'POST', url: '/v1/pagos/webhook/prueba', payload: cuerpo, headers: { 'content-type': 'application/json', [CABECERA_FIRMA]: firma } });
const referencia = (url: string) => url.split('/').pop()!;
const veces = async (accion: string, entidadId: string) => (await m.q(`SELECT 1 FROM bitacora WHERE accion = $1 AND entidad_id = $2`, [accion, entidadId])).length;

describe('pagar por pasarela', () => {
  it('abre una sesión alojada y la reutiliza si el cliente vuelve a pulsar', async () => {
    const { a, p } = await pedidoReservado();
    const r = await pagar(p.id, a.auth);
    expect(r.statusCode).toBe(200);
    const s = SesionDePago.parse(r.json());
    expect(s.url).toMatch(/^https:\/\/api\.prueba\/v1\/pasarela-prueba\/ps_/);
    expect(SesionDePago.parse((await pagar(p.id, a.auth)).json()).pagoId).toBe(s.pagoId);
    expect(await veces('pago.iniciado', s.pagoId)).toBe(1);
  });

  it('el aviso firmado confirma el pedido una sola vez aunque llegue dos veces (P5)', async () => {
    const { a, p } = await pedidoReservado();
    const s = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    const { cuerpo, firma } = await pasarela.resolver(referencia(s.url), 'aprobado');
    expect((await avisar(cuerpo, firma)).json()).toMatchObject({ resultado: 'confirmado' });
    expect((await avisar(cuerpo, firma)).json()).toMatchObject({ resultado: 'duplicado' });

    const x = await leer(p.id, a.auth);
    expect(x.estado).toBe('pagado');
    expect(x.reservas.every((r) => r.estado === 'confirmada')).toBe(true);
    expect(x.pagos[0]).toMatchObject({ estado: 'aprobado', metodo: 'pasarela', montoCentimos: p.totalCentimos });
    expect(await veces('pedido.pagado', p.id)).toBe(1);
    expect(await m.q(`SELECT 1 FROM outbox WHERE tipo = 'pedido.pagado' AND datos->>'pedido_id' = $1`, [p.id])).toHaveLength(1);
    expect((await pagar(p.id, a.auth)).json()).toMatchObject({ error: 'ya_pagado' });
  });

  it('sin aviso, la conciliación de los trabajos lo confirma igual', async () => {
    const { a, p } = await pedidoReservado();
    const s = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    await pasarela.resolver(referencia(s.url), 'aprobado'); // el aviso se «pierde»: no se entrega
    await m.b.comoWorker();
    try {
      const { rows } = await m.b.pg.query<{ referencia_externa: string }>(`select * from pagos_por_conciliar('0 seconds')`);
      expect(rows.map((r) => r.referencia_externa)).toContain(referencia(s.url));
      const e = await pasarela.consultar(referencia(s.url));
      const { rows: r } = await m.b.pg.query<{ r: string }>(`select resolver_pago('prueba', $1, 'conciliacion', $2, $3::estado_pago, $4, $5, '{}'::jsonb) as r`, [
        `conciliacion:${referencia(s.url)}:${e.estado}`, referencia(s.url), e.estado, e.montoCentimos, e.moneda,
      ]);
      expect(r[0]!.r).toBe('confirmado');
    } finally {
      await m.b.comoApi();
    }
    expect((await leer(p.id, a.auth)).estado).toBe('pagado');
  });

  it('rechaza avisos con firma inválida y no confirma montos distintos', async () => {
    const { a, p } = await pedidoReservado();
    const s = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    const { cuerpo } = await pasarela.resolver(referencia(s.url), 'aprobado');
    expect((await avisar(cuerpo, firmar(cuerpo, 'otro-secreto-que-no-es-el-de-la-pasarela'))).statusCode).toBe(400);
    const otro = cuerpo.replace(`"monto":${p.totalCentimos}`, '"monto":1').replace(/"id":"[^"]+"/, '"id":"evt_falso"');
    expect((await avisar(otro, firmar(otro, SECRETO))).json()).toMatchObject({ resultado: 'monto_distinto' });
    expect((await leer(p.id, a.auth)).estado).toBe('reservado');
  });

  it('un pago rechazado deja el pedido reservado y se puede intentar otra vez', async () => {
    const { a, p } = await pedidoReservado();
    const s = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    const { cuerpo, firma } = await pasarela.resolver(referencia(s.url), 'rechazado');
    expect((await avisar(cuerpo, firma)).json()).toMatchObject({ resultado: 'rechazado' });
    expect((await leer(p.id, a.auth)).estado).toBe('reservado');
    expect(SesionDePago.parse((await pagar(p.id, a.auth)).json()).pagoId).not.toBe(s.pagoId);
  });

  it('un pago que llega con el pedido ya vencido queda aprobado y se avisa para devolverlo', async () => {
    const { a, p } = await pedidoReservado();
    const s = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    await m.q(`UPDATE pedidos SET reserva_vence_at = now() - interval '1 minute' WHERE id = $1`, [p.id]);
    await m.b.comoWorker();
    await m.b.pg.query('select liberar_reservas_vencidas()');
    await m.b.comoApi();
    const { cuerpo, firma } = await pasarela.resolver(referencia(s.url), 'aprobado');
    expect((await avisar(cuerpo, firma)).json()).toMatchObject({ resultado: 'tardio' });
    const x = await leer(p.id, a.auth);
    expect(x.estado).toBe('vencido');
    expect(x.pagos[0]).toMatchObject({ estado: 'aprobado', motivo: 'Llegó con el pedido vencido' });
    expect(await m.q(`SELECT 1 FROM outbox WHERE tipo = 'pago.tardio' AND datos->>'pago_id' = $1`, [s.pagoId])).toHaveLength(1);
  });

  it('un segundo cobro del mismo pedido queda registrado para devolverlo', async () => {
    const { a, p } = await pedidoReservado();
    const uno = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    // Una segunda sesión abierta a la vez (otra pestaña): se fuerza vencer la primera en la base para que no se reutilice.
    await m.q(`UPDATE pagos SET vence_at = now() WHERE id = $1`, [uno.pagoId]);
    const dos = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    const r1 = await pasarela.resolver(referencia(uno.url), 'aprobado');
    const r2 = await pasarela.resolver(referencia(dos.url), 'aprobado');
    expect((await avisar(r1.cuerpo, r1.firma)).json()).toMatchObject({ resultado: 'confirmado' });
    expect((await avisar(r2.cuerpo, r2.firma)).json()).toMatchObject({ resultado: 'tardio' });
    const x = await leer(p.id, a.auth);
    expect(x.pagos.filter((g) => g.estado === 'aprobado')).toHaveLength(2);
    expect(x.pagos.find((g) => g.id === dos.pagoId)!.motivo).toBe('Llegó con el pedido pagado');
  });

  it('no deja pagar el pedido de otra cuenta', async () => {
    const { p } = await pedidoReservado();
    const otro = await m.anunciante();
    expect((await pagar(p.id, otro.auth)).statusCode).toBe(404);
  });

  it('la página de prueba entrega el aviso y devuelve al portal', async () => {
    const { a, p } = await pedidoReservado();
    const s = SesionDePago.parse((await pagar(p.id, a.auth)).json());
    const ref = referencia(s.url);
    const pagina = await m.app.inject(`/v1/pasarela-prueba/${ref}`);
    expect(pagina.statusCode).toBe(200);
    expect(pagina.body).toContain('Pagar (prueba)');
    // El navegador aplica form-action también a la redirección: la política debe dejar volver al portal.
    expect(pagina.headers['content-security-policy']).toContain("form-action 'self' https://portal.prueba");
    const r = await m.app.inject({ method: 'POST', url: `/v1/pasarela-prueba/${ref}`, payload: 'resultado=aprobado', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toBe(`https://portal.prueba/cuenta/pedidos/${p.id}?pago=ok`);
    expect((await leer(p.id, a.auth)).estado).toBe('pagado');
  });
});

describe('pagar por transferencia', () => {
  function comprobante(auth: Record<string, string>, pedidoId: string, referenciaBanco: string, datos = PDF) {
    const limite = '----prueba' + Math.random().toString(16).slice(2);
    const cuerpo = Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="referencia"\r\n\r\n${referenciaBanco}\r\n`),
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="comprobante.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      datos,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    return m.app.inject({ method: 'POST', url: `/v1/pedidos/${pedidoId}/comprobante`, payload: cuerpo, headers: { ...auth, 'content-type': `multipart/form-data; boundary=${limite}` } });
  }

  it('el cliente sube el comprobante, finanzas lo aprueba y el pedido queda pagado', async () => {
    const { a, p } = await pedidoReservado();
    expect((await m.app.inject({ url: '/v1/pagos/transferencia', headers: a.auth })).json()).toMatchObject({ banco: 'Banco de ejemplo', esEjemplo: true });
    const r = await comprobante(a.auth, p.id, 'REF-123456');
    expect(r.statusCode).toBe(201);
    const pago = Pago.parse(r.json());
    expect(pago).toMatchObject({ metodo: 'transferencia', estado: 'pendiente', referencia: 'REF-123456' });
    expect(archivos.claves()).toContain(`comprobantes/${a.anuncianteId}/${pago.id}.pdf`);
    expect((await pagar(p.id, a.auth)).json()).toMatchObject({ error: 'transferencia_en_revision' });

    const revisor = await m.sesionEquipo(['revisor']);
    expect((await m.app.inject({ url: '/v1/panel/pagos/transferencias', headers: revisor })).statusCode).toBe(403);
    const fin = await m.sesionEquipo(['finanzas']);
    const lista = TransferenciaPorRevisar.array().parse((await m.app.inject({ url: '/v1/panel/pagos/transferencias', headers: fin })).json());
    expect(lista.find((x) => x.id === pago.id)).toMatchObject({ referencia: 'REF-123456', montoCentimos: p.totalCentimos });
    const archivo = await m.app.inject({ url: `/v1/panel/pagos/${pago.id}/comprobante`, headers: fin });
    expect(archivo.headers['content-type']).toBe('application/pdf');

    const d = await m.app.inject({ method: 'POST', url: `/v1/panel/pagos/${pago.id}/decision`, payload: { decision: 'aprobar' }, headers: fin });
    expect(d.json()).toMatchObject({ resultado: 'confirmado' });
    expect((await leer(p.id, a.auth)).estado).toBe('pagado');
    expect((await m.app.inject({ method: 'POST', url: `/v1/panel/pagos/${pago.id}/decision`, payload: { decision: 'aprobar' }, headers: fin })).statusCode).toBe(409);
  });

  it('rechazar pide un motivo y el cliente puede volver a intentar', async () => {
    const { a, p } = await pedidoReservado();
    const pago = Pago.parse((await comprobante(a.auth, p.id, 'REF-999')).json());
    const fin = await m.sesionEquipo(['finanzas']);
    expect((await m.app.inject({ method: 'POST', url: `/v1/panel/pagos/${pago.id}/decision`, payload: { decision: 'rechazar' }, headers: fin })).statusCode).toBe(400);
    const d = await m.app.inject({ method: 'POST', url: `/v1/panel/pagos/${pago.id}/decision`, payload: { decision: 'rechazar', motivo: 'El monto no coincide' }, headers: fin });
    expect(d.json()).toMatchObject({ resultado: 'rechazado' });
    const x = await leer(p.id, a.auth);
    expect(x.estado).toBe('reservado');
    expect(x.pagos[0]).toMatchObject({ estado: 'rechazado', motivo: 'El monto no coincide' });
    expect((await comprobante(a.auth, p.id, 'REF-1000')).statusCode).toBe(201);
  });

  it('con un comprobante por revisar, el pedido no vence', async () => {
    const { a, p } = await pedidoReservado();
    await comprobante(a.auth, p.id, 'REF-777');
    await m.q(`UPDATE pedidos SET reserva_vence_at = now() - interval '1 minute' WHERE id = $1`, [p.id]);
    await m.b.comoWorker();
    await m.b.pg.query('select liberar_reservas_vencidas()');
    await m.b.comoApi();
    expect((await leer(p.id, a.auth)).estado).toBe('reservado');
  });

  it('solo acepta PDF o imagen', async () => {
    const { a, p } = await pedidoReservado();
    const r = await comprobante(a.auth, p.id, 'REF-1', Buffer.from('MZ ejecutable'));
    expect(r.json()).toMatchObject({ error: 'formato' });
  });
});
