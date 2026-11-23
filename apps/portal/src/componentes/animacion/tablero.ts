import { $, type Control } from './control';
import { ESTELARES } from './datos';

/**
 * Tablero «al aire» del héroe, estilo aeropuerto: las letras giran hasta formar el mensaje. Alterna lo que suena ahora
 * en Caracas, lo que sigue y «10 emisoras 10 ciudades». Escribe dentro de `#liveNow`.
 */
const GLIFOS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·';
const hora = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Mensajes del momento según la hora de Venezuela (UTC−4). Pura: recibe la fecha. */
export function mensajesAlAire(ahora: Date): string[] {
  const u = new Date(ahora.getTime() - 4 * 3600e3);
  const dia = u.getUTCDay();
  const h = u.getUTCHours() + u.getUTCMinutes() / 60;
  const actual = ESTELARES.find((s) => s.dias.includes(dia) && h >= s.desde && h < s.hasta);
  const sigue = ESTELARES.filter((s) => s.dias.includes(dia) && s.desde > h).sort((a, b) => a.desde - b.desde)[0];
  return [
    actual ? `Al aire ${actual.nombre}` : 'Al aire musica',
    sigue ? `Sigue ${sigue.nombre} ${hora(sigue.desde)}` : 'Mañana ENCENDIDOS 06:00',
    '10 emisoras 10 ciudades',
  ];
}

function girarA(c: Control, el: HTMLElement, texto: string) {
  texto = texto.toUpperCase();
  [...el.childNodes].forEach((n) => n.nodeType === Node.TEXT_NODE && n.remove());
  el.classList.add('flapboard');
  el.setAttribute('aria-label', texto);
  while (el.children.length < texto.length) {
    const s = document.createElement('span');
    s.className = 'fc';
    s.setAttribute('aria-hidden', 'true');
    el.appendChild(s);
  }
  [...el.children].forEach((s, i) => {
    if (i >= texto.length) return s.remove();
    const destino = texto[i]!;
    const fijar = () => {
      s.textContent = destino;
      s.classList.toggle('sp', destino === ' ');
    };
    if (c.reduce) return fijar();
    let vueltas = 4 + (i % 7);
    const paso = () => {
      if (vueltas-- <= 0) return fijar();
      s.textContent = GLIFOS[Math.floor(Math.random() * GLIFOS.length)]!;
      s.classList.remove('sp', 'f');
      void (s as HTMLElement).offsetWidth; // reinicia la animación de giro
      s.classList.add('f');
      c.luego(paso, 55);
    };
    paso();
  });
}

export function tablero(c: Control) {
  const el = $('#liveNow');
  if (!el) return;
  let i = 0;
  const siguiente = () => {
    const m = mensajesAlAire(new Date());
    girarA(c, el, m[i++ % m.length]!);
    c.luego(siguiente, c.reduce ? 60000 : 4800);
  };
  siguiente();
}
