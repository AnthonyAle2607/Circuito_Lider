/** Piezas de movimiento que usan los componentes React (cotizador, tienda, parrilla). */

/** Odómetro: cada dígito rueda hasta su valor. Devuelve la función que fija el texto (p. ej. «$1.250»). */
export function odometro(el: HTMLElement) {
  let patron = '';
  return (v: string) => {
    const p = v.replace(/\d/g, '#');
    el.setAttribute('aria-label', v);
    if (p !== patron) {
      patron = p;
      el.innerHTML = '';
      el.classList.add('odo');
      for (const ch of v) {
        const s = document.createElement('span');
        s.setAttribute('aria-hidden', 'true');
        if (/\d/.test(ch)) {
          s.className = 'c';
          for (let i = 0; i < 10; i++) {
            const d = document.createElement('span');
            d.textContent = String(i);
            s.appendChild(d);
          }
        } else {
          s.className = 's';
          s.textContent = ch;
        }
        el.appendChild(s);
      }
    }
    const digitos = [...v].filter((ch) => /\d/.test(ch));
    el.querySelectorAll<HTMLElement>('.c').forEach((c, i) => (c.style.transform = `translateY(${-Number(digitos[i])}em)`));
  };
}

/** Chispas al agregar algo a la pauta. `host` debe tener `position: relative`. */
export function chispas(host: HTMLElement, x: number, y: number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--a', `${i * 45 + Math.random() * 12}deg`);
    host.appendChild(s);
    setTimeout(() => s.remove(), 550);
  }
}
