import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarParrilla, cargarTarifarioEjemplo, leerArchivoParrilla } from '@sp/catalogo';
import { diaIso, hoyEnCaracas, sumarDias } from '@sp/inventory';
import { simulador } from '@sp/sales-agent/simulador';
import { montar } from './ayuda';

const sim = simulador([]);
const config = { topeTurnoMicroUsd: 500_000, topeConversacionMicroUsd: 3_000_000, topeDiaMicroUsd: 40_000_000, turnos: 40, largoMensaje: 2000 };
const m = await montar({ agente: { cliente: sim.cliente, config } });
afterAll(() => m.cerrar());
const DATOS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos');

let franja = '';
let lunes = '';
beforeAll(async () => {
  await m.dueño(async () => {
    await cargarParrilla(m.b.db, leerArchivoParrilla(`${DATOS}/circuito-lider.yaml`));
    await cargarTarifarioEjemplo(m.b.db, `${DATOS}/tarifario-ejemplo.yaml`);
  });
  franja = (await m.q<{ id: string }>(`SELECT f.id FROM franjas f JOIN programas p ON p.id = f.programa_id WHERE p.nombre = 'ENCENDIDOS' AND f.dia_semana = 1`))[0]!.id;
  lunes = sumarDias(hoyEnCaracas(), 1);
  while (diaIso(lunes) !== 1) lunes = sumarDias(lunes, 1);
});

/** Lee los eventos SSE de la respuesta. */
function eventos(cuerpo: string) {
  return cuerpo
    .split('\n\n')
    .filter(Boolean)
    .map((b) => ({ evento: /event: (.+)/.exec(b)![1]!, datos: JSON.parse(/data: (.+)/.exec(b)![1]!) }));
}
const hablar = (texto: string, token?: string, headers: Record<string, string> = {}) =>
  m.app.inject({ method: 'POST', url: '/v1/agente/mensajes', payload: { texto, ...(token && { token }) }, headers: { ...m.ip(), ...headers } });

describe('chat con Toño', () => {
  it('cotiza con la función de dominio, transmite la respuesta y guarda la conversación', async () => {
    sim.guion.push(
      { bloques: [{ herramienta: 'cotizar', entrada: { duracion_segundos: 30, emisiones: [{ franja_id: franja, fecha: lunes }] } }] },
      { bloques: [{ texto: 'Listo, aquí está tu cotización.' }] },
    );
    const r = await hablar('Quiero ENCENDIDOS el próximo lunes');
    expect(r.headers['content-type']).toContain('text/event-stream');
    const ev = eventos(r.body);
    const token = ev.find((e) => e.evento === 'inicio')!.datos.token as string;
    expect(ev.filter((e) => e.evento === 'texto').map((e) => e.datos.texto).join('')).toContain('Listo');
    expect(ev.at(-1)).toEqual({ evento: 'fin', datos: { estado: 'agente' } });

    const [c] = await m.q<{ id: string; turnos: number; cotizaciones: string[]; costo_micro_usd: string }>(`SELECT id, turnos, cotizaciones, costo_micro_usd FROM conversaciones`);
    expect(c!.turnos).toBe(1);
    expect(c!.cotizaciones).toHaveLength(1);
    expect(Number(c!.costo_micro_usd)).toBeGreaterThan(0);
    // P12: la cotización sabe de qué conversación salió y la bitácora registra al agente.
    expect(await m.q(`SELECT 1 FROM cotizaciones WHERE id = $1 AND conversacion_id = $2`, [c!.cotizaciones[0], c!.id])).toHaveLength(1);
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'cotizacion.creada' AND actor_tipo = 'agente' AND entidad_id = $1`, [c!.cotizaciones[0]])).toHaveLength(1);
    expect(await m.q(`SELECT orden FROM conversacion_mensajes WHERE conversacion_id = $1 ORDER BY orden`, [c!.id])).toHaveLength(5);

    // Segundo turno: se reenvía el historial guardado tal cual y se añade al final.
    sim.guion.push({ bloques: [{ texto: '¿Algo más?' }] });
    const antes = sim.enviados.length;
    await hablar('Gracias', token);
    const previo = sim.enviados[antes - 1]!.messages as unknown[];
    const ahora = sim.enviados[antes]!.messages as unknown[];
    expect(ahora.slice(0, previo.length + 1).slice(0, 2)).toEqual(previo.slice(0, 2));
    expect(ahora.length).toBe(5 + 2);
  });

  it('un traspaso deja la conversación con ventas, que la ve en su bandeja y la cierra', async () => {
    sim.guion.push(
      { bloques: [{ herramienta: 'pasar_a_persona', entrada: { motivo: 'Pide comisión de agencia', resumen: 'Agencia con 3 marcas' } }] },
      { bloques: [{ texto: 'Te escribirá alguien de ventas.' }] },
    );
    const ev = eventos((await hablar('Somos agencia, ¿qué comisión dan?')).body);
    expect(ev.at(-1)!.datos).toEqual({ estado: 'traspasada' });
    const token = ev[0]!.datos.token as string;
    expect(await m.q(`SELECT 1 FROM outbox WHERE tipo = 'agente.traspaso'`)).toHaveLength(1);
    // Con la conversación en manos de ventas, el agente ya no responde.
    const otra = eventos((await hablar('¿Hola?', token)).body);
    expect(otra.at(-1)!.datos).toEqual({ estado: 'traspasada' });

    const revisor = await m.sesionEquipo(['revisor']);
    expect((await m.app.inject({ url: '/v1/panel/agente/conversaciones', headers: revisor })).statusCode).toBe(403);
    const ventas = await m.sesionEquipo(['ventas']);
    const b = (await m.app.inject({ url: '/v1/panel/agente/conversaciones', headers: ventas })).json();
    expect(b.conversaciones[0]).toMatchObject({ estado: 'traspasada', traspaso: { motivo: 'Pide comisión de agencia' } });
    const det = (await m.app.inject({ url: `/v1/panel/agente/conversaciones/${b.conversaciones[0].id}`, headers: ventas })).json();
    expect(det.mensajes.map((x: { quien: string }) => x.quien)).toEqual(['cliente', 'herramienta', 'agente']);
    expect((await m.app.inject({ method: 'POST', url: `/v1/panel/agente/conversaciones/${b.conversaciones[0].id}/cerrar`, headers: ventas })).statusCode).toBe(204);
  });

  it('con el tope del día alcanzado no llama al modelo y pasa a ventas (P9)', async () => {
    await m.q(`INSERT INTO agente_gasto_diario (dia, costo_micro_usd) VALUES ($1, $2) ON CONFLICT (dia) DO UPDATE SET costo_micro_usd = excluded.costo_micro_usd`, [hoyEnCaracas(), config.topeDiaMicroUsd]);
    const antes = sim.enviados.length;
    const ev = eventos((await hablar('Hola')).body);
    expect(sim.enviados.length).toBe(antes);
    expect(ev.at(-1)!.datos).toEqual({ estado: 'traspasada' });
    await m.q(`DELETE FROM agente_gasto_diario`);
  });

  it('rechaza mensajes vacíos y conversaciones que no existen', async () => {
    expect((await hablar('   ')).statusCode).toBe(400);
    expect((await hablar('hola', 'x'.repeat(32))).json()).toMatchObject({ error: 'conversacion_no_existe' });
  });
});

describe('sin credenciales', () => {
  it('el agente queda apagado y el portal usa sus respuestas fijas', async () => {
    const otra = await montar();
    try {
      const r = await otra.app.inject({ method: 'POST', url: '/v1/agente/mensajes', payload: { texto: 'hola' } });
      expect(r.json()).toMatchObject({ error: 'agente_apagado' });
    } finally {
      await otra.cerrar();
    }
  });
});
