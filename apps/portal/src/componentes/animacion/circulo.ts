import { $, type Control } from './control';
import { ESTACIONES } from './datos';

/**
 * Círculo de cobertura: las diez emisoras giran despacio alrededor de un dial. Se arrastra para girarlo con inercia y
 * no se detiene con el cursor (regla del diseño). Usa `#wheel`, `#orbit` y `#ticks`.
 */
export function circulo(c: Control) {
  const rueda = $('#wheel');
  const orbita = $('#orbit');
  const marcas = $('#ticks');
  if (!rueda || !orbita || !marcas) return;

  const rotulos = ESTACIONES.map((s, i) => {
    const a = (i / ESTACIONES.length) * Math.PI * 2 - Math.PI / 2;
    const d = document.createElement('div');
    d.className = 'st';
    d.style.left = `${50 + Math.cos(a) * 50}%`;
    d.style.top = `${50 + Math.sin(a) * 50}%`;
    const r = document.createElement('span');
    const f = document.createElement('b');
    f.textContent = s.frecuencia;
    r.append(f, s.ciudad);
    d.appendChild(r);
    orbita.appendChild(d);
    return r;
  });
  for (let i = 0; i <= 30; i++) {
    const t = document.createElement('i');
    if (i % 5 === 0) t.className = 'm';
    t.style.transform = `translateX(-50%) rotate(${-135 + i * 9}deg)`;
    marcas.appendChild(t);
  }

  const base = c.reduce ? 0 : 9;
  let ang = 0;
  let v = base;
  let arrastrando = false;
  let ultAng = 0;
  let ultT = 0;
  let ultimo = performance.now();
  const anguloDe = (e: PointerEvent) => {
    const r = rueda.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const bucle = (ahora: number) => {
    const dt = Math.min(0.05, (ahora - ultimo) / 1000);
    ultimo = ahora;
    if (!arrastrando) {
      v += (base - v) * Math.min(1, dt * 1.4);
      ang += v * dt;
    }
    orbita.style.transform = `rotate(${ang}deg)`;
    rotulos.forEach((s) => (s.style.transform = `rotate(${-ang}deg)`));
    c.raf(bucle);
  };
  c.raf(bucle);

  rueda.addEventListener('pointerdown', (e) => {
    arrastrando = true;
    ultAng = anguloDe(e);
    ultT = performance.now();
    rueda.classList.add('dragging');
    rueda.setPointerCapture(e.pointerId);
  });
  rueda.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    const a = anguloDe(e);
    const ahora = performance.now();
    let d = a - ultAng;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    ang += d;
    v = d / Math.max(0.008, (ahora - ultT) / 1000);
    ultAng = a;
    ultT = ahora;
  });
  const soltar = () => {
    arrastrando = false;
    rueda.classList.remove('dragging');
    v = Math.max(-720, Math.min(720, v));
  };
  rueda.addEventListener('pointerup', soltar);
  rueda.addEventListener('pointercancel', soltar);
}
