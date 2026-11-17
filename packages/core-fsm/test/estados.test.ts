import { describe, expect, it } from 'vitest';
import { TransicionInvalida, cotizacion, pedido } from '../src/index';

describe('pedido', () => {
  it('solo un pedido reservado se paga, se cancela o vence', () => {
    expect(pedido.siguiente('reservado', 'pagar')).toBe('pagado');
    expect(pedido.siguiente('reservado', 'cancelar')).toBe('cancelado');
    expect(pedido.siguiente('reservado', 'vencer')).toBe('vencido');
  });

  it.each([
    ['vencido', 'pagar'],
    ['cancelado', 'pagar'],
    ['pagado', 'cancelar'],
    ['pagado', 'vencer'],
    ['vencido', 'cancelar'],
  ] as const)('«%s» no admite «%s»', (desde, evento) => {
    expect(() => pedido.siguiente(desde, evento)).toThrow(TransicionInvalida);
    expect(pedido.puede(desde, evento)).toBe(false);
  });

  it('expone los estados de origen de cada evento y los finales', () => {
    expect(pedido.origenes('cancelar')).toEqual(['reservado']);
    expect(pedido.finales).toEqual(['pagado', 'cancelado', 'vencido']);
  });
});

describe('cotización', () => {
  it('una cotización en aprobación no se reserva hasta que ventas la apruebe', () => {
    expect(cotizacion.puede('en_aprobacion', 'reservar')).toBe(false);
    expect(cotizacion.siguiente('en_aprobacion', 'aprobar')).toBe('vigente');
    expect(cotizacion.siguiente('vigente', 'reservar')).toBe('reservada');
  });

  it('una cotización reservada o rechazada no se vuelve a usar', () => {
    expect(() => cotizacion.siguiente('reservada', 'reservar')).toThrow(/no está permitido/);
    expect(() => cotizacion.siguiente('rechazada', 'aprobar')).toThrow(TransicionInvalida);
  });
});
