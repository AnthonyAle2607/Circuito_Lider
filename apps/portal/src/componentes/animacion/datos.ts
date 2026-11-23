/**
 * Datos fijos de los efectos decorativos de la portada (no de la venta: esos vienen de la API). Si cambia una
 * frecuencia o un programa estelar, se corrige aquí.
 */

/** Paleta de marca para lo que se dibuja con SVG (el CSS usa sus propios tokens en `estilos/tokens.css`). */
export const MARCA = {
  morado: '#2E123E',
  morado2: '#3E1A52',
  morado3: '#52266B',
  linea: '#5E3A75',
  blanco: '#FFFFFF',
  naranja: '#FE6B00',
  escritorio: '#251036',
} as const;

export interface Estacion {
  ciudad: string;
  frecuencia: string;
}

/** Las diez emisoras de Circuito Líder, en el orden en que se sientan en la redacción del héroe. */
export const ESTACIONES: Estacion[] = [
  { ciudad: 'Caracas', frecuencia: '94.9' },
  { ciudad: 'Valencia', frecuencia: '106.7' },
  { ciudad: 'Maracaibo', frecuencia: '100.5' },
  { ciudad: 'Barquisimeto', frecuencia: '94.9' },
  { ciudad: 'Mérida', frecuencia: '92.3' },
  { ciudad: 'San Cristóbal', frecuencia: '91.1' },
  { ciudad: 'El Vigía', frecuencia: '100.1' },
  { ciudad: 'Puerto Ordaz', frecuencia: '100.3' },
  { ciudad: 'Puerto La Cruz', frecuencia: '100.5' },
  { ciudad: 'Margarita', frecuencia: '97.3' },
];

/** Programas estelares de Caracas para el tablero «al aire» (días ISO 0 = domingo; horas decimales, UTC−4). */
export const ESTELARES = [
  { dias: [1, 2, 3, 4, 5], desde: 6, hasta: 9, nombre: 'ENCENDIDOS' },
  { dias: [1, 2, 3, 4, 5], desde: 9, hasta: 11, nombre: 'Máximo Volumen' },
  { dias: [1, 2, 3, 4, 5], desde: 11, hasta: 13, nombre: 'CONVOCADOS' },
  { dias: [1, 2, 3, 4, 5], desde: 13, hasta: 15, nombre: 'Batita en Líder' },
  { dias: [1, 2, 3, 4, 5], desde: 15.25, hasta: 16.25, nombre: 'El 3 Pack' },
  { dias: [1, 2, 3, 4, 5], desde: 17, hasta: 18, nombre: 'AL AIRE' },
  { dias: [5, 6], desde: 21, hasta: 25, nombre: 'Play House Líder' },
  { dias: [6, 0], desde: 9, hasta: 10, nombre: 'Más que To2' },
];
