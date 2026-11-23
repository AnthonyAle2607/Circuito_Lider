import { describe, expect, it } from 'vitest';
import { LIMITES, MODELO, atender, ejecutar, type Dominio, type Efectos, type Evento } from '../src';
import { simulador } from './simulador';

/** Un dominio falso con una emisora, un programa y precios de ejemplo. */
function dominio(): Dominio & { cotizaciones: unknown[] } {
  const cotizaciones: unknown[] = [];
  return {
    cotizaciones,
    emisoras: async () => [{ slug: 'caracas', nombre: 'Líder 94.9', ciudad: 'Caracas', frecuencia: '94.9 FM' }],
    parrilla: async (s) => (s === 'caracas' ? [{ nombre: 'ENCENDIDOS', alcance: 'nacional', descripcion: null, franjas: [{ id: 'f-lun', dia: 1, inicio: '06:00', fin: '09:00' }] }] : null),
    tarifas: async () => ({ moneda: 'USD', esEjemplo: true, duraciones: [30, 40], precios: [{ alcance: 'nacional', duracionSegundos: 30, centimos: 6000 }], descuentos: [], umbralAprobacionCentimos: 500000 }),
    cupos: async () => [],
    cotizar: async (d) => {
      cotizaciones.push(d);
      return { ok: true, id: 'cot-1', totalCentimos: 6000 * d.emisiones.length, moneda: 'USD', emisiones: d.emisiones.length, descuentoBps: 0, requiereAprobacion: false, venceAt: '2026-11-25T12:00:00Z', enlace: 'https://portal/cotizacion/cot-1' };
    },
  };
}
const efectos = (): Efectos => ({ prospecto: {}, cotizaciones: [], traspaso: null });
const base = { historial: [], contexto: 'Hoy es lunes 23 de noviembre de 2026.', topeMicroUsd: 1_000_000 };

describe('un turno del agente', () => {
  it('cotiza con la herramienta, transmite el texto y deja los mensajes listos para guardar', async () => {
    const { cliente, enviados } = simulador([
      { bloques: [{ texto: 'Te armo la cotización.' }, { herramienta: 'cotizar', entrada: { duracion_segundos: 30, emisiones: [{ franja_id: 'f-lun', fecha: '2026-11-30' }] } }] },
      { bloques: [{ texto: 'Listo: USD 60. Reserva aquí: https://portal/cotizacion/cot-1' }], uso: { input_tokens: 200, output_tokens: 40, cache_read_input_tokens: 3000 } },
    ]);
    const eventos: Evento[] = [];
    const d = dominio();
    const ef = efectos();
    const t = await atender({ ...base, cliente, dominio: d, efectos: ef, texto: 'Quiero sonar en ENCENDIDOS el lunes', emitir: (e) => eventos.push(e) });

    expect(t.final).toBe('respondido');
    expect(d.cotizaciones).toEqual([{ duracionSegundos: 30, emisiones: [{ franjaId: 'f-lun', fecha: '2026-11-30' }] }]);
    expect(ef.cotizaciones).toEqual(['cot-1']);
    expect(eventos.filter((e) => e.tipo === 'texto').map((e) => (e as { texto: string }).texto).join('')).toContain('USD 60');
    expect(eventos).toContainEqual({ tipo: 'herramienta', nombre: 'cotizar', estado: 'ok' });
    // usuario, sistema (contexto), asistente con tool_use, resultados, asistente final
    expect(t.nuevos.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant']);
    expect(t.uso).toMatchObject({ entrada: 1200, salida: 140, cacheLectura: 3000 });
    expect(t.costoMicroUsd).toBe(Math.ceil(1200 * 4 + 140 * 20 + 3000 * 0.2));

    // Lo que se envió: el modelo, esfuerzo bajo, respaldo por rechazo, instrucciones y herramientas cacheadas.
    const p = enviados[0]!;
    expect(p).toMatchObject({ model: MODELO, output_config: { effort: 'low' }, fallbacks: 'default', cache_control: { type: 'ephemeral' } });
    expect((p.system as Array<{ cache_control?: unknown }>)[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect((p.tools as Array<{ name: string; strict: boolean }>).every((h) => h.strict)).toBe(true);
    // El segundo pedido repite el primero tal cual y añade al final (append-only: la caché sirve).
    expect((enviados[1]!.messages as unknown[]).slice(0, 2)).toEqual(enviados[0]!.messages);
  });

  it('si el modelo declina, despide al cliente y lo pasa a una persona', async () => {
    const { cliente } = simulador([{ bloques: [], stop: 'refusal' }]);
    const eventos: Evento[] = [];
    const ef = efectos();
    const t = await atender({ ...base, cliente, dominio: dominio(), efectos: ef, texto: '…', emitir: (e) => eventos.push(e) });
    expect(t.final).toBe('declinado');
    expect(ef.traspaso?.motivo).toMatch(/declinó/);
    expect(eventos.some((e) => e.tipo === 'texto' && e.texto.includes('equipo de ventas'))).toBe(true);
    expect(t.nuevos.map((m) => m.role)).toEqual(['user', 'system']);
  });

  it('corta y pasa a ventas al superar el tope de gasto (P9)', async () => {
    const { cliente } = simulador([{ bloques: [{ herramienta: 'ver_emisoras', entrada: {} }], uso: { input_tokens: 100_000, output_tokens: 1000 } }]);
    const ef = efectos();
    const t = await atender({ ...base, topeMicroUsd: 100_000, cliente, dominio: dominio(), efectos: ef, texto: 'hola', emitir: () => {} });
    expect(t.final).toBe('tope');
    expect(ef.traspaso).not.toBeNull();
  });

  it('pasar_a_persona marca el traspaso', async () => {
    const { cliente } = simulador([
      { bloques: [{ herramienta: 'pasar_a_persona', entrada: { motivo: 'Pide descuento de agencia', resumen: 'Agencia con 3 marcas' } }] },
      { bloques: [{ texto: 'Te escribirá alguien de ventas.' }] },
    ]);
    const ef = efectos();
    const t = await atender({ ...base, cliente, dominio: dominio(), efectos: ef, texto: 'Soy agencia, ¿qué comisión dan?', emitir: () => {} });
    expect(t.final).toBe('traspaso');
    expect(ef.traspaso).toEqual({ motivo: 'Pide descuento de agencia', resumen: 'Agencia con 3 marcas' });
  });
});

describe('límites en código (D18)', () => {
  it('rechaza entradas fuera del esquema sin tocar el dominio', async () => {
    const d = dominio();
    const r = await ejecutar('cotizar', { duracion_segundos: 30, emisiones: [], descuento: 50 }, d, efectos());
    expect(r.error).toBe(true);
    expect(d.cotizaciones).toHaveLength(0);
  });

  it('no deja pasar del tope de cotizaciones por conversación', async () => {
    const ef = efectos();
    ef.cotizaciones = Array.from({ length: LIMITES.maxCotizaciones }, (_, i) => `c${i}`);
    const r = await ejecutar('cotizar', { duracion_segundos: 30, emisiones: [{ franja_id: 'f', fecha: '2026-11-30' }] }, dominio(), ef);
    expect(r).toMatchObject({ error: true });
    expect(r.contenido).toContain('tope_de_cotizaciones');
  });

  it('guarda solo los datos que llegaron y no acepta herramientas inventadas', async () => {
    const ef = efectos();
    await ejecutar('guardar_prospecto', { nombre: 'Ana', presupuesto_usd: 2000 }, dominio(), ef);
    expect(ef.prospecto).toEqual({ nombre: 'Ana', presupuesto_usd: 2000 });
    expect((await ejecutar('aplicar_descuento', { porcentaje: 30 }, dominio(), ef)).error).toBe(true);
  });
});
