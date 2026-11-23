/**
 * Control del ciclo de vida de los efectos de la portada. Todo temporizador, bucle de animación, observador y evento
 * de ventana pasa por aquí, para que `apagar()` lo detenga al salir de la página (en una SPA los bucles seguirían
 * corriendo después de navegar).
 */
export interface Control {
  /** El usuario pidió menos movimiento: los efectos muestran su estado final sin animar. */
  reduce: boolean;
  raf(f: FrameRequestCallback): number;
  cada(f: () => void, ms: number): number;
  luego(f: () => void, ms: number): number;
  enVentana<K extends keyof WindowEventMap>(tipo: K, f: (e: WindowEventMap[K]) => void, op?: AddEventListenerOptions): void;
  observador(cb: IntersectionObserverCallback, op?: IntersectionObserverInit): IntersectionObserver;
  apagar(): void;
}

export function crearControl(): Control {
  const ctl = new AbortController();
  const tiempos = new Set<number>();
  const observadores: IntersectionObserver[] = [];
  return {
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
    raf: (f) => (ctl.signal.aborted ? 0 : requestAnimationFrame(f)),
    cada(f, ms) {
      const id = window.setInterval(f, ms);
      tiempos.add(id);
      return id;
    },
    luego(f, ms) {
      const id = window.setTimeout(f, ms);
      tiempos.add(id);
      return id;
    },
    enVentana: (tipo, f, op = {}) => window.addEventListener(tipo, f, { ...op, signal: ctl.signal }),
    observador(cb, op) {
      const o = new IntersectionObserver(cb, op);
      observadores.push(o);
      return o;
    },
    apagar() {
      ctl.abort();
      tiempos.forEach((id) => {
        window.clearTimeout(id);
        window.clearInterval(id);
      });
      observadores.forEach((o) => o.disconnect());
    },
  };
}

/** Atajo tipado de `document.querySelector`. */
export const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);

/** Crea un elemento SVG con sus atributos y lo cuelga de `padre`. */
export function svg(tag: string, attrs: Record<string, string | number> = {}, padre?: Element): SVGElement {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement;
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  padre?.appendChild(e);
  return e;
}
