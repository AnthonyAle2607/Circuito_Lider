import { describe, expect, it } from 'vitest';
import { mensajesAlAire } from '../src/componentes/animacion/tablero';
import { RESPUESTAS, SIN_RESPUESTA, responder } from '../src/componentes/animacion/tono-respuestas';

describe('tablero «al aire» (hora de Venezuela, UTC−4)', () => {
  it('lunes 07:00 en Caracas: suena ENCENDIDOS y sigue Máximo Volumen', () => {
    const [ahora, sigue] = mensajesAlAire(new Date('2026-11-23T11:00:00Z'));
    expect(ahora).toBe('Al aire ENCENDIDOS');
    expect(sigue).toBe('Sigue Máximo Volumen 09:00');
  });

  it('fuera de los estelares dice música y anuncia el de mañana', () => {
    const [ahora, sigue] = mensajesAlAire(new Date('2026-11-24T03:30:00Z')); // lunes 23:30 en Caracas
    expect(ahora).toBe('Al aire musica');
    expect(sigue).toBe('Mañana ENCENDIDOS 06:00');
  });
});

describe('respuestas de Toño', () => {
  it('reconoce el tema por palabras clave', () => {
    expect(responder('¿Cuánto cuesta?')).toBe(RESPUESTAS.precios);
    expect(responder('quiero hablar con un asesor')).toBe(RESPUESTAS.persona);
    expect(responder('Hola')).toBe(RESPUESTAS.hola);
  });

  it('sin coincidencia ofrece los temas que sí conoce', () => {
    expect(responder('qwerty')).toBe(SIN_RESPUESTA);
  });
});
