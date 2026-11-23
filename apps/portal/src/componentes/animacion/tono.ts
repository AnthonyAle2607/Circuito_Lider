import { $, svg, type Control } from './control';
import { MARCA as K } from './datos';
import { RAPIDAS, RESPUESTAS, responder } from './tono-respuestas';

/**
 * Toño, la mascota del chat de soporte. Se queda en su esquina (no sigue el cursor), saluda una vez y responde con el
 * guion de `tono-respuestas.ts`. El marcado está en `inicio/Tono.tsx`.
 */
function dibujar(host: Element): SVGElement {
  const s = svg('svg', { viewBox: '0 0 200 240', class: 'tono' }, host);
  const b = svg('g', { class: 'mbody' }, s);
  svg('rect', { x: 66, y: 196, width: 18, height: 34, rx: 9, fill: K.morado }, b);
  svg('rect', { x: 116, y: 196, width: 18, height: 34, rx: 9, fill: K.morado }, b);
  svg('line', { x1: 100, y1: 58, x2: 100, y2: 16, stroke: K.morado, 'stroke-width': 6, 'stroke-linecap': 'round' }, b);
  svg('circle', { cx: 100, cy: 14, r: 12, fill: K.naranja, stroke: K.morado, 'stroke-width': 4, class: 'ball' }, b);
  svg('path', { d: 'M34 138 Q12 150 16 176', fill: 'none', stroke: K.morado, 'stroke-width': 10, 'stroke-linecap': 'round' }, b);
  const brazo = svg('g', { class: 'arm' }, b);
  svg('path', { d: 'M166 138 Q190 124 186 98', fill: 'none', stroke: K.morado, 'stroke-width': 10, 'stroke-linecap': 'round' }, brazo);
  svg('circle', { cx: 186, cy: 94, r: 10, fill: K.blanco, stroke: K.morado, 'stroke-width': 4 }, brazo);
  svg('rect', { x: 28, y: 56, width: 144, height: 146, rx: 36, fill: K.naranja, stroke: K.morado, 'stroke-width': 6 }, b);
  svg('rect', { x: 46, y: 74, width: 108, height: 68, rx: 20, fill: K.morado }, b);
  for (const x of [78, 122]) {
    const ojo = svg('g', { class: 'eye' }, b);
    svg('ellipse', { cx: x, cy: 104, rx: 13, ry: 15, fill: '#fff' }, ojo);
    svg('circle', { cx: x + 2, cy: 106, r: 6.5, fill: K.morado }, ojo);
  }
  svg('ellipse', { cx: 100, cy: 130, rx: 9, ry: 3.5, fill: K.naranja, class: 'mouth' }, b);
  for (let i = 0; i < 3; i++) svg('line', { x1: 52, y1: 160 + i * 10, x2: 108, y2: 160 + i * 10, stroke: K.morado, 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.5 }, b);
  svg('circle', { cx: 136, cy: 170, r: 12, fill: K.naranja, stroke: K.morado, 'stroke-width': 4 }, b);
  return s;
}

export function tono(c: Control) {
  const boton = $<HTMLButtonElement>('#supBtn');
  const panel = $('#panel');
  const mensajes = $('#pm');
  const rapidas = $('#pq');
  const aviso = $('#teaser');
  const estado = $('#tst');
  const entrada = $<HTMLInputElement>('#pin');
  const mini = $('#tonoMini');
  if (!boton || !panel || !mensajes || !rapidas || !aviso || !estado || !entrada || !mini) return;

  const grande = dibujar(boton);
  const chico = dibujar(mini);
  const hablar = (on: boolean) => [grande, chico].forEach((s) => s.classList.toggle('talk', on));
  const bajar = () => mensajes.scrollTo({ top: mensajes.scrollHeight, behavior: c.reduce ? 'auto' : 'smooth' });
  const burbuja = (clase: string) => {
    const m = document.createElement('div');
    m.className = `bm ${clase}`;
    mensajes.appendChild(m);
    bajar();
    return m;
  };

  let cola = Promise.resolve();
  const decir = (html: string) => {
    cola = cola.then(async () => {
      const escribiendo = burbuja('t typing');
      escribiendo.innerHTML = '<i></i><i></i><i></i>';
      hablar(true);
      estado.textContent = 'Toño está escribiendo…';
      await new Promise((r) => c.luego(() => r(null), c.reduce ? 50 : Math.min(1500, 450 + html.length * 10)));
      escribiendo.remove();
      hablar(false);
      estado.textContent = 'Soporte Invermedia · en línea';
      burbuja('t').innerHTML = html;
    });
  };
  const usuario = (t: string) => (burbuja('u').textContent = t);

  let saludado = false;
  const abrir = () => {
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    aviso.classList.remove('on');
    if (!saludado) {
      saludado = true;
      decir('¡Hola! 👋 Soy <b>Toño</b>, el de soporte.');
      decir('¿En qué te ayudo con tu pauta de radio?');
      for (const [texto, tema] of RAPIDAS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = texto;
        b.onclick = () => {
          usuario(texto);
          decir(RESPUESTAS[tema]);
        };
        rapidas.appendChild(b);
      }
    }
    c.luego(() => entrada.focus(), 300);
  };
  const cerrar = () => {
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    boton.focus();
  };

  boton.onclick = () => (panel.hidden ? abrir() : cerrar());
  aviso.onclick = abrir;
  $('#tclose')?.addEventListener('click', cerrar);
  c.enVentana('keydown', (e) => e.key === 'Escape' && !panel.hidden && cerrar());
  $('#pf')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = entrada.value.trim();
    if (!v) return;
    entrada.value = '';
    usuario(v);
    decir(responder(v));
  });
  // En teléfonos, al seguir un enlace del chat se cierra para dejar ver la sección.
  mensajes.addEventListener('click', (e) => {
    if ((e.target as Element).closest("a[href^='#']") && innerWidth < 700) cerrar();
  });
  // Saludo: Toño agita la mano y muestra un mensaje corto, sin moverse de su esquina.
  c.luego(() => {
    if (!panel.hidden) return;
    aviso.classList.add('on');
    grande.classList.add('wave');
    c.luego(() => grande.classList.remove('wave'), 2000);
    c.luego(() => aviso.classList.remove('on'), 7000);
  }, c.reduce ? 500 : 2500);
}
