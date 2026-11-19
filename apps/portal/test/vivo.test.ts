import { describe, expect, it } from 'vitest';
import type { Parrilla } from '@sp/schemas';
import { cuando, enAntena, horario, relojCaracas, textoDias } from '../src/lib/vivo';

const f = (dia: number, inicio: string, fin: string) => ({ id: `${dia}${inicio}`, dia, inicio, fin, segundosTanda: 240, cupoConfirmado: false, activa: true });
const p: Parrilla = {
  emisora: { id: 'e', slug: 'caracas', nombre: 'Líder Caracas', ciudad: 'Caracas', frecuencia: '94.9 FM', streamUrl: null, descripcion: null },
  zonaHoraria: 'America/Caracas',
  programas: [
    { id: '1', nombre: 'ENCENDIDOS', alcance: 'nacional', locutores: null, descripcion: null, franjas: [1, 2, 3, 4, 5].map((d) => f(d, '06:00', '09:00')) },
    { id: '2', nombre: 'Máximo Volumen', alcance: 'local', locutores: null, descripcion: null, franjas: [1, 2, 3, 4, 5].map((d) => f(d, '09:00', '11:00')) },
    {
      id: '3',
      nombre: 'Play House Líder',
      alcance: 'local',
      locutores: null,
      descripcion: null,
      franjas: [f(5, '21:00', '24:00'), f(6, '00:00', '01:00'), f(6, '21:00', '24:00'), f(7, '00:00', '01:00')],
    },
  ],
};
/** Una hora de Caracas (UTC−4) como Date. 2026-11-23 es lunes. */
const caracas = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-04:00`);

describe('reloj de Caracas', () => {
  it('da el día ISO y los minutos en hora de Venezuela, sin importar la zona del servidor', () => {
    expect(relojCaracas(new Date('2026-11-23T03:30:00Z'))).toEqual({ dia: 7, minutos: 23 * 60 + 30 });
  });
});

describe('qué suena ahora', () => {
  it('encuentra el programa al aire y el siguiente', () => {
    const r = enAntena(p, caracas('2026-11-23', '07:15'));
    expect(r.ahora?.programa).toBe('ENCENDIDOS');
    expect(r.despues).toMatchObject({ programa: 'Máximo Volumen', inicio: '09:00' });
  });

  it('entre programas es música continua y dice qué viene', () => {
    const r = enAntena(p, caracas('2026-11-23', '12:00'));
    expect(r.ahora).toBeNull();
    expect(r.despues).toMatchObject({ programa: 'ENCENDIDOS', dia: 2 });
  });

  it('un programa partido en la medianoche no se anuncia como «después» de sí mismo', () => {
    const r = enAntena(p, caracas('2026-11-27', '23:30'));
    expect(r.ahora?.programa).toBe('Play House Líder');
    expect(r.despues).toMatchObject({ programa: 'Play House Líder', dia: 6, inicio: '21:00' });
  });

  it('el domingo en la noche da la vuelta a la semana', () => {
    expect(enAntena(p, caracas('2026-11-29', '20:00')).despues).toMatchObject({ programa: 'ENCENDIDOS', dia: 1 });
  });
});

describe('horarios legibles', () => {
  it('resume los días', () => {
    expect(textoDias([1, 2, 3, 4, 5])).toBe('L–V');
    expect(textoDias([6, 7])).toBe('S y D');
    expect(textoDias([3])).toBe('miércoles');
    expect(textoDias([1, 3, 5])).toBe('L, X, V');
    expect(textoDias([1, 2, 3, 4, 5, 6, 7])).toBe('todos los días');
  });

  it('agrupa por hora y muestra la medianoche como 00:00', () => {
    expect(horario(p.programas[2]!.franjas)).toEqual(['S y D · 00:00–01:00', 'V y S · 21:00–00:00']);
    expect(horario(p.programas[0]!.franjas)).toEqual(['L–V · 06:00–09:00']);
  });
});

describe('cuándo', () => {
  it('dice hoy, mañana o el día (y del domingo pasa al lunes)', () => {
    const lunes = caracas('2026-11-23', '10:00');
    expect(cuando(1, lunes)).toBe('hoy');
    expect(cuando(2, lunes)).toBe('mañana');
    expect(cuando(5, lunes)).toBe('el viernes');
    expect(cuando(1, caracas('2026-11-29', '22:00'))).toBe('mañana');
  });
});
