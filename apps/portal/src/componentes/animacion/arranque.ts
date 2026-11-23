/** Arranque de los efectos de la portada: cada módulo busca su marcado y no hace nada si no está en la página. */
import { circulo } from './circulo';
import { crearControl } from './control';
import { redaccion } from './redaccion';
import { tablero } from './tablero';
import { tono } from './tono';

export { chispas, odometro } from './piezas';

/** Arranca los efectos sobre el marcado de la portada y devuelve la función que los apaga. */
export function iniciarEfectos(): () => void {
  const c = crearControl();
  redaccion(c);
  tablero(c);
  circulo(c);
  tono(c);
  return c.apagar;
}
