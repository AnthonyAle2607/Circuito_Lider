import { $, svg, type Control } from './control';
import { ESTACIONES, MARCA as C, type Estacion } from './datos';

/**
 * Héroe: una redacción de radio con diez agentes, cada uno en su emisora. Se arma al cargar (los agentes suben, cada
 * radio sintoniza su frecuencia) y tres burbujas muestran tareas que cambian cada pocos segundos. Plano, sin degradados.
 * Dibuja dentro de `<svg id="newsroom">` (viewBox 1200 × 660).
 */
const PIEL = ['#8D5A3B', '#C68B62', '#5E3A26', '#E0B08A', '#A86F4C', '#704328', '#D79F78', '#B67B55', '#4E2F1F', '#C68B62'];
const PELO = ['#2E123E', '#3A2418', '#2E123E', '#6B3E22', '#2E123E', '#2A1A12', '#8A5530', '#2E123E', '#2A1A12', '#6B3E22'];
const CAMISA = [C.naranja, C.blanco, C.naranja, C.morado2, C.naranja, C.blanco, C.morado2, C.naranja, C.blanco, C.naranja];
const RADIO = [C.naranja, C.naranja, C.blanco, C.naranja, C.blanco, C.naranja, C.naranja, C.blanco, C.naranja, C.blanco];
const TAREAS = (s: Estacion) => [
  `Programando ${s.ciudad}`,
  'Revisando spot · 30 s',
  '✓ Spot aprobado',
  `Al aire · ${s.frecuencia} FM`,
  'Cotizando 3 emisoras',
  'Certificando 42 / 42',
  'Cupo: ENCENDIDOS 06:40',
  '✓ Pago confirmado',
];
/** Fila de atrás (4 agentes) y de adelante (6, algo más chicos): [índice de emisora, x]. */
const ATRAS: Array<[number, number]> = [[5, 330], [6, 510], [7, 690], [8, 870]];
const ADELANTE: Array<[number, number]> = [[0, 95], [1, 291], [2, 487], [3, 683], [4, 879], [9, 1075]];

const curva = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const g = (p: Element, a: Record<string, string | number> = {}) => svg('g', a, p);

function cabeza(p: Element, i: number, retraso: number) {
  const h = g(p, { class: 'head', style: `--d:${retraso * 3}` });
  svg('circle', { cx: 0, cy: -152, r: 28, fill: PIEL[i]! }, h);
  const pelo = PELO[i]!;
  // Cuatro peinados para que no sean clones.
  if (i % 4 === 0) svg('path', { d: 'M-29 -154 A29 29 0 0 1 29 -154 L29 -162 Q0 -196 -29 -162 Z', fill: pelo }, h);
  if (i % 4 === 1) {
    svg('path', { d: 'M-30 -150 Q-32 -186 0 -184 Q32 -186 30 -150 L26 -160 Q0 -172 -26 -160 Z', fill: pelo }, h);
    svg('circle', { cx: 0, cy: -188, r: 12, fill: pelo }, h);
  }
  if (i % 4 === 2) for (const [cx, cy] of [[-20, -170], [-6, -180], [10, -180], [22, -168], [-26, -156], [27, -154]]) svg('circle', { cx: cx!, cy: cy!, r: 11, fill: pelo }, h);
  if (i % 4 === 3) svg('path', { d: 'M-31 -150 Q-34 -190 0 -186 Q34 -190 31 -150 L31 -112 L22 -112 L22 -158 Q0 -170 -22 -158 L-22 -112 L-31 -112 Z', fill: pelo }, h);
  svg('circle', { cx: -9, cy: -150, r: 2.8, fill: C.morado }, h);
  svg('circle', { cx: 9, cy: -150, r: 2.8, fill: C.morado }, h);
  svg('path', { d: 'M-7 -138 Q0 -133 7 -138', fill: 'none', stroke: C.morado, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, h);
  // Audífonos y, en la mitad de los agentes, micrófono.
  svg('path', { d: 'M-31 -152 A31 31 0 0 1 31 -152', fill: 'none', stroke: C.morado, 'stroke-width': 6 }, h);
  svg('rect', { x: -39, y: -164, width: 12, height: 26, rx: 5, fill: C.morado }, h);
  svg('rect', { x: 27, y: -164, width: 12, height: 26, rx: 5, fill: C.morado }, h);
  if (i % 2 === 0) {
    svg('path', { d: 'M33 -144 Q34 -126 14 -130', fill: 'none', stroke: C.morado, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, h);
    svg('circle', { cx: 12, cy: -130, r: 5, fill: C.morado }, h);
  }
}

function agente(p: Element, i: number, x: number, y: number, s: number, retraso: number) {
  const cuerpo = g(g(p, { transform: `translate(${x} ${y}) scale(${s})` }), { class: 'rise', style: `--d:${retraso}` });
  svg('rect', { x: -50, y: -160, width: 100, height: 170, rx: 22, fill: C.morado3 }, cuerpo);
  svg('rect', { x: -40, y: -112, width: 80, height: 124, rx: 28, fill: CAMISA[i]! }, cuerpo);
  svg('rect', { x: -9, y: -128, width: 18, height: 22, rx: 4, fill: PIEL[i]! }, cuerpo);
  cabeza(cuerpo, i, retraso);
}

interface Pantalla { t: SVGElement; hasta: number; retraso: number }
interface Burbuja { g: SVGElement; t: SVGElement; st: Estacion }

function radio(p: Element, i: number, retraso: number, pantallas: Pantalla[]) {
  const r = g(p);
  svg('line', { x1: 96, y1: -70, x2: 124, y2: -122, stroke: C.blanco, 'stroke-width': 3, 'stroke-linecap': 'round' }, r);
  svg('circle', { cx: 124, cy: -122, r: 4, fill: C.blanco }, r);
  svg('rect', { x: 18, y: -74, width: 96, height: 74, rx: 12, fill: RADIO[i]!, stroke: C.morado, 'stroke-width': 3 }, r);
  for (let k = 0; k < 5; k++) svg('line', { x1: 28, y1: -56 + k * 9, x2: 52, y2: -56 + k * 9, stroke: C.morado, 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0.55 }, r);
  svg('rect', { x: 58, y: -64, width: 48, height: 24, rx: 4, fill: C.morado }, r);
  const t = svg('text', { x: 82, y: -46, 'text-anchor': 'middle', fill: C.naranja, 'font-size': 15, 'font-weight': 700 }, r);
  t.textContent = '88.0';
  pantallas.push({ t, hasta: parseFloat(ESTACIONES[i]!.frecuencia), retraso });
  svg('circle', { cx: 82, cy: -18, r: 9, fill: C.blanco, stroke: C.morado, 'stroke-width': 2.5 }, r);
  svg('line', { x1: 82, y1: -18, x2: 82, y2: -25, stroke: C.morado, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, r);
  svg('circle', { cx: 30, cy: -66, r: 4, fill: C.naranja, class: 'lamp', style: `--d:${retraso * 2}` }, r);
  for (let k = 0; k < 3; k++) svg('rect', { x: 98 + k * 5, y: -30, width: 3, height: 12, fill: C.morado, class: 'eqb', style: `animation-delay:${-k * 0.25 - i * 0.1}s` }, r);
}

function escritorio(p: Element, i: number, x: number, y: number, s: number, retraso: number, pantallas: Pantalla[], burbujas: Burbuja[]) {
  const st = ESTACIONES[i]!;
  const fuera = g(p, { transform: `translate(${x} ${y}) scale(${s})` });
  const it = g(fuera, { class: 'rise', style: `--d:${retraso + 60}` });
  // Brazos, consola y manos que teclean.
  svg('path', { d: 'M-30 -92 Q-48 -50 -50 -12', fill: 'none', stroke: CAMISA[i]!, 'stroke-width': 17, 'stroke-linecap': 'round' }, it);
  svg('path', { d: 'M30 -92 Q4 -46 -14 -14', fill: 'none', stroke: CAMISA[i]!, 'stroke-width': 17, 'stroke-linecap': 'round' }, it);
  svg('rect', { x: -82, y: -10, width: 84, height: 12, rx: 4, fill: C.morado }, it);
  for (let k = 0; k < 5; k++) svg('rect', { x: -76 + k * 15, y: -8, width: 9, height: 5, rx: 1.5, fill: k === 2 ? C.naranja : C.linea }, it);
  svg('circle', { cx: -50, cy: -14, r: 8, fill: PIEL[i]!, class: 'hand', style: '--k:0' }, it);
  svg('circle', { cx: -14, cy: -16, r: 8, fill: PIEL[i]!, class: 'hand', style: '--k:1' }, it);
  radio(it, i, retraso, pantallas);
  // Cinta con la ciudad.
  const cinta = g(g(fuera, { transform: 'translate(0 36) rotate(-3)' }), { class: 'tp', style: `--d:${retraso}` });
  const w = Math.max(120, st.ciudad.length * 12 + 70);
  svg('rect', { x: -w / 2, y: -16, width: w, height: 32, fill: C.naranja, stroke: C.morado, 'stroke-width': 2.5 }, cinta);
  svg('text', { x: 0, y: 8, 'text-anchor': 'middle', fill: C.morado, 'font-size': 22 }, cinta).textContent = `${st.ciudad} ${st.frecuencia}`;
  // Burbuja de tarea (vacía hasta que le toque).
  const b = g(g(fuera, { transform: 'translate(0 -232)' }), { class: 'bub' });
  svg('rect', { x: -92, y: -22, width: 184, height: 40, rx: 12, fill: C.blanco, stroke: C.morado, 'stroke-width': 2.5 }, b);
  svg('path', { d: 'M-8 18 L0 30 L8 18 Z', fill: C.blanco, stroke: C.morado, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, b);
  svg('rect', { x: -6, y: 14, width: 12, height: 6, fill: C.blanco }, b);
  const t = svg('text', { x: 0, y: 4, 'text-anchor': 'middle', fill: C.morado, 'font-size': 13, 'font-weight': 700 }, b);
  burbujas.push({ g: b, t, st });
}

function fondo(raiz: Element) {
  const bg = g(raiz);
  for (let i = 0; i < 4; i++) svg('circle', { cx: 600, cy: 300, r: 200, fill: 'none', stroke: C.blanco, 'stroke-width': 2, class: 'ring', style: `animation-delay:${i * 1.2}s` }, bg);
  svg('circle', { cx: 600, cy: 300, r: 200, fill: C.naranja, class: 'disc' }, bg);
  svg('text', { x: 600, y: 150, 'text-anchor': 'middle', fill: C.morado, 'font-size': 22, 'font-weight': 700, 'letter-spacing': 6 }, bg).textContent = 'AL AIRE';
}

export function redaccion(c: Control) {
  const lienzo = $<SVGSVGElement>('#newsroom');
  if (!lienzo) return;
  const raiz = g(lienzo, { class: 'nr' });
  fondo(raiz);
  const pantallas: Pantalla[] = [];
  const burbujas: Burbuja[] = [];
  const [filaA, mesaA, cosasA, filaB, mesaB, cosasB] = Array.from({ length: 6 }, () => g(raiz));
  ATRAS.forEach(([i, x], k) => agente(filaA!, i, x, 402, 0.78, 200 + k * 110));
  svg('rect', { x: 210, y: 400, width: 780, height: 44, rx: 6, fill: C.escritorio }, mesaA);
  svg('rect', { x: 210, y: 398, width: 780, height: 6, fill: C.morado3 }, mesaA);
  ATRAS.forEach(([i, x], k) => escritorio(cosasA!, i, x, 402, 0.78, 200 + k * 110, pantallas, burbujas));
  ADELANTE.forEach(([i, x], k) => agente(filaB!, i, x, 560, 0.9, 650 + k * 110));
  svg('rect', { x: 20, y: 558, width: 1160, height: 102, rx: 10, fill: C.escritorio }, mesaB);
  svg('rect', { x: 20, y: 556, width: 1160, height: 8, fill: C.morado3 }, mesaB);
  ADELANTE.forEach(([i, x], k) => escritorio(cosasB!, i, x, 560, 0.9, 650 + k * 110, pantallas, burbujas));

  // Cada radio sintoniza su frecuencia al aparecer.
  for (const { t, hasta, retraso } of pantallas) {
    if (c.reduce) {
      t.textContent = hasta.toFixed(1);
      continue;
    }
    c.luego(() => {
      const t0 = performance.now();
      const paso = (ahora: number) => {
        const p = Math.min(1, (ahora - t0) / 1100);
        t.textContent = (88 + (hasta - 88) * curva(p)).toFixed(1);
        if (p < 1) c.raf(paso);
      };
      c.raf(paso);
    }, retraso + 400);
  }

  // Tres burbujas visibles a la vez, con tareas que rotan.
  let turno = 0;
  const rotar = () => {
    const ver = new Set<number>();
    while (ver.size < 3) ver.add(Math.floor(Math.random() * burbujas.length));
    burbujas.forEach((b, i) => {
      const lista = TAREAS(b.st);
      if (ver.has(i)) b.t.textContent = lista[(turno + i) % lista.length]!;
      b.g.classList.toggle('on', ver.has(i));
    });
    turno++;
  };
  c.luego(() => {
    rotar();
    if (!c.reduce) c.cada(() => !document.hidden && rotar(), 2600);
  }, c.reduce ? 0 : 1900);
}
