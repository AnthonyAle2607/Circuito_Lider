/**
 * Huella acústica propia (PT-7), al estilo de Haitsma y Kalker (2002): por cada ventana corta de audio se mide la
 * energía en 33 bandas entre 300 y 2.000 Hz, y cada uno de los 32 bits dice si la diferencia de energía entre dos
 * bandas vecinas sube o baja respecto de la ventana anterior. Lo que se compara son esos patrones, no el sonido: por
 * eso aguanta la compresión del streaming, el cambio de volumen y el ruido de la emisora.
 *
 * Todo es puro (recibe muestras, devuelve números). Leer audio con ffmpeg está en `audio.ts`.
 */

/** Frecuencia de muestreo con la que se calcula todo (ffmpeg convierte a esta). */
export const TASA = 5512;
/** Ventana: 1.024 muestras ≈ 186 ms. */
export const VENTANA = 1024;
/** Salto entre ventanas: 128 muestras ≈ 23 ms (7/8 de solapamiento). */
export const SALTO = 128;
const BANDAS = 33;
const F_MIN = 300;
const F_MAX = 2000;

export const segundosPorCuadro = SALTO / TASA;

// ── FFT radix-2, en el lugar ────────────────────────────────────────────────
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const hann = (() => {
  const w = new Float64Array(VENTANA);
  for (let i = 0; i < VENTANA; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (VENTANA - 1));
  return w;
})();

/** Límites (en índices de la FFT) de las 34 fronteras de las 33 bandas, en escala logarítmica. */
const limites = (() => {
  const l: number[] = [];
  for (let b = 0; b <= BANDAS; b++) {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, b / BANDAS);
    l.push(Math.round((f * VENTANA) / TASA));
  }
  return l;
})();

/**
 * La huella de un audio: un número de 32 bits por cuadro (cada 23 ms). `desde` corre el inicio unas muestras, para
 * comparar también desalineado por menos de un salto.
 */
export function huella(muestras: Float32Array, desde = 0): Uint32Array {
  const n = Math.max(0, Math.floor((muestras.length - desde - VENTANA) / SALTO) + 1);
  const out = new Uint32Array(Math.max(0, n - 1));
  const re = new Float64Array(VENTANA);
  const im = new Float64Array(VENTANA);
  let previa: Float64Array | null = null;
  for (let c = 0; c < n; c++) {
    const base = desde + c * SALTO;
    for (let i = 0; i < VENTANA; i++) {
      re[i] = muestras[base + i]! * hann[i]!;
      im[i] = 0;
    }
    fft(re, im);
    const e = new Float64Array(BANDAS);
    for (let b = 0; b < BANDAS; b++) {
      let s = 0;
      for (let k = limites[b]!; k < limites[b + 1]!; k++) s += re[k]! * re[k]! + im[k]! * im[k]!;
      e[b] = s;
    }
    if (previa) {
      let bits = 0;
      for (let m = 0; m < 32; m++) {
        const d = e[m]! - e[m + 1]! - (previa[m]! - previa[m + 1]!);
        if (d > 0) bits |= 1 << m;
      }
      out[c - 1] = bits >>> 0;
    }
    previa = e;
  }
  return out;
}

function unos(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export interface Hallazgo {
  /** Segundo dentro de la grabación donde empieza el spot. */
  segundo: number;
  /** Proporción de bits distintos: 0 = idéntico, ~0,5 = nada que ver. */
  error: number;
}

/** Por debajo de este error se da por encontrado (la referencia del método usa 0,35; aquí se es más estricto). */
export const UMBRAL = 0.3;

/**
 * Busca el spot dentro de la grabación. Primero recorre con una muestra de cuadros del spot (rápido) y afina en los
 * mejores candidatos con todos los cuadros. Prueba el spot desfasado unas muestras, porque la emisora no lo pone
 * alineado con nuestras ventanas. Devuelve todas las apariciones bajo el umbral, separadas al menos lo que dura el
 * spot (una misma tanda puede repetirlo), ordenadas por tiempo.
 */
export function buscar(grabacion: Uint32Array, spots: Uint32Array[], umbral = UMBRAL): Hallazgo[] {
  const candidatos: Hallazgo[] = [];
  for (const spot of spots) {
    const L = spot.length;
    if (L < 20 || grabacion.length < L) continue;
    const paso = 8;
    const muestra: number[] = [];
    for (let i = 0; i < L; i += paso) muestra.push(i);
    for (let p = 0; p + L <= grabacion.length; p++) {
      let malos = 0;
      for (const i of muestra) malos += unos((grabacion[p + i]! ^ spot[i]!) >>> 0);
      if (malos / (32 * muestra.length) > umbral + 0.08) continue;
      malos = 0;
      for (let i = 0; i < L; i++) malos += unos((grabacion[p + i]! ^ spot[i]!) >>> 0);
      const error = malos / (32 * L);
      if (error < umbral) candidatos.push({ segundo: p * segundosPorCuadro, error });
    }
  }
  // Una aparición genera varios candidatos vecinos: se queda el mejor de cada grupo.
  candidatos.sort((a, b) => a.error - b.error);
  const duracion = Math.min(...spots.map((s) => s.length)) * segundosPorCuadro;
  const elegidos: Hallazgo[] = [];
  for (const c of candidatos) {
    if (elegidos.every((e) => Math.abs(e.segundo - c.segundo) > duracion * 0.8)) elegidos.push(c);
  }
  return elegidos.sort((a, b) => a.segundo - b.segundo);
}

/** Las huellas del spot desfasadas 0, ¼, ½ y ¾ de salto, para `buscar`. */
export function huellasDelSpot(muestras: Float32Array): Uint32Array[] {
  return [0, 32, 64, 96].map((d) => huella(muestras, d));
}
