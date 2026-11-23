'use client';

import { useEffect, useRef, useState } from 'react';
import type { Emisora } from '@sp/schemas';

/**
 * El dial del cotizador: la frecuencia rueda hasta la emisora elegida y la onda (un canvas) se ensucia de ruido
 * mientras sintoniza; al llegar, muestra la ciudad. Respeta `prefers-reduced-motion` (sin animación).
 * Devuelve las referencias que el componente engancha y `ensuciar()` para un golpe de ruido al elegir una hora.
 */
export function useSintonizador(actual: Emisora | undefined) {
  const frecuencia = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tono = useRef({ f: 88, ruido: 1, token: 0 });
  const [rotulo, setRotulo] = useState<{ t: string; s: string }>({ t: 'Buscando señal', s: ' ' });

  // La onda: se dibuja en cada cuadro con más o menos ruido según `tono.ruido`.
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let vivo = true;
    const medir = () => {
      const r = cv.getBoundingClientRect();
      cv.width = r.width * devicePixelRatio;
      cv.height = r.height * devicePixelRatio;
    };
    medir();
    addEventListener('resize', medir);
    const onda = (tm: number) => {
      if (!vivo) return;
      const { width: w, height: h } = cv;
      const n = tono.current.ruido;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#FE6B00';
      ctx.lineWidth = 2.2 * devicePixelRatio;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const u = x / w;
        const y =
          h / 2 +
          (1 - n * 0.85) * h * 0.32 * Math.sin(u * Math.PI) * (Math.sin(u * 26 + tm / 300) * 0.6 + Math.sin(u * 61 - tm / 170) * 0.4) +
          (Math.random() - 0.5) * n * h * 0.8;
        if (x) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      if (!reduce) requestAnimationFrame(onda);
    };
    requestAnimationFrame(onda);
    return () => {
      vivo = false;
      removeEventListener('resize', medir);
    };
  }, []);

  // La frecuencia: de donde estaba a la de la emisora, con una curva suave.
  useEffect(() => {
    if (!actual) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const T = tono.current;
    const mio = ++T.token;
    const desde = T.f;
    const hasta = parseFloat(actual.frecuencia);
    const dur = reduce ? 0 : Math.min(1400, 450 + Math.abs(hasta - desde) * 80);
    const t0 = performance.now();
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    setRotulo({ t: 'Sintonizando…', s: ' ' });
    const paso = (now: number) => {
      if (mio !== T.token) return;
      const pr = dur ? Math.min(1, (now - t0) / dur) : 1;
      T.f = desde + (hasta - desde) * ease(pr);
      T.ruido = reduce ? 0 : pr < 1 ? Math.min(1, 0.4 + Math.abs(hasta - T.f) / 2.5) : Math.max(0, T.ruido - 0.05);
      if (frecuencia.current) frecuencia.current.textContent = T.f.toFixed(1);
      if (pr < 1 || T.ruido > 0) requestAnimationFrame(paso);
      else setRotulo({ t: actual.ciudad, s: `${actual.nombre} · ${actual.frecuencia}` });
    };
    requestAnimationFrame(paso);
  }, [actual]);

  const ensuciar = () => {
    tono.current.ruido = Math.max(tono.current.ruido, 0.7);
  };

  return { frecuencia, canvas, rotulo, ensuciar };
}
