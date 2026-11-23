'use client';

import { useEffect, useRef, useState } from 'react';
import { chispas } from '../animacion';

/**
 * Botón «Mantén para cotizar»: se llena mientras se presiona (ratón, toque, espacio o Enter) y al completarse llama
 * a `alConfirmar`. Soltar antes lo vacía. Así no se crea una cotización por un clic accidental.
 * Devuelve la referencia del botón y si ya se disparó (para el texto «Cotizando…»).
 */
export function useMantener(alConfirmar: (reiniciar: () => void) => void) {
  const boton = useRef<HTMLButtonElement>(null);
  const [disparado, setDisparado] = useState(false);
  // Siempre la versión vigente de la acción (lee el estado actual de la pauta al confirmar).
  const accion = useRef(alConfirmar);
  accion.current = alConfirmar;

  useEffect(() => {
    const b = boton.current;
    if (!b) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let progreso = 0;
    let sosteniendo = false;
    let ultimo = 0;
    let hecho = false;

    const bucle = (now: number) => {
      const dt = (now - ultimo) / 1000;
      ultimo = now;
      if (hecho) return;
      progreso = sosteniendo ? Math.min(1, progreso + dt / (reduce ? 0.2 : 1.1)) : Math.max(0, progreso - dt * 2.5);
      b.style.setProperty('--p', String(progreso));
      if (progreso >= 1) {
        hecho = true;
        b.classList.add('done');
        const r = b.getBoundingClientRect();
        chispas(b, r.width / 2, r.height / 2);
        setDisparado(true);
        accion.current(() => setDisparado(false));
        setTimeout(() => {
          hecho = false;
          progreso = 0;
          b.classList.remove('done');
          b.style.setProperty('--p', '0');
        }, 2500);
        return;
      }
      if (sosteniendo || progreso > 0) requestAnimationFrame(bucle);
    };
    const empezar = () => {
      if (hecho || b.disabled) return;
      sosteniendo = true;
      ultimo = performance.now();
      requestAnimationFrame(bucle);
    };
    const parar = () => {
      sosteniendo = false;
    };
    const abajo = (e: PointerEvent) => {
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // Algunos navegadores no capturan el puntero en botones deshabilitados: no importa.
      }
      empezar();
    };
    const tecla = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        empezar();
      }
    };
    const soltar = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') parar();
    };
    const eventos: Array<[string, EventListener]> = [
      ['pointerdown', abajo as EventListener],
      ['pointerup', parar],
      ['pointercancel', parar],
      ['pointerleave', parar],
      ['keydown', tecla as EventListener],
      ['keyup', soltar as EventListener],
    ];
    eventos.forEach(([n, f]) => b.addEventListener(n, f));
    return () => eventos.forEach(([n, f]) => b.removeEventListener(n, f));
  }, []);

  return { boton, disparado };
}
