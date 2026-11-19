/**
 * Reglas de revisión del spot (PT-6). Puras: no leen archivos, base ni hora. Decisiones de Anthony (2026-11-19):
 * duración máxima 40 s, que rechaza sola; una palabra prohibida manda el spot a revisión humana, no lo rechaza.
 */

export const FORMATOS = ['mp4', 'mp3', 'wav'] as const;
export type Formato = (typeof FORMATOS)[number];

/** Un tramo de la transcripción con su tiempo (segundos desde el inicio del audio). */
export interface Segmento {
  inicio: number;
  fin: number;
  texto: string;
}

export interface Coincidencia {
  palabra: string;
  /** Segundo del audio donde aparece (redondeado hacia abajo). */
  segundo: number;
  /** El texto oído, para que la persona que revisa vea el contexto. */
  contexto: string;
}

/** Minúsculas, sin tildes ni diéresis, solo letras y números separados por un espacio. «¡Güevón!» → «guevon». */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/**
 * Busca las palabras prohibidas en la transcripción. Palabra entera (o frase entera): «puta» no marca «computadora»
 * ni «disputa». Devuelve cada aparición con su segundo, en orden.
 */
export function buscarPalabras(segmentos: Segmento[], prohibidas: string[]): Coincidencia[] {
  const lista = [...new Set(prohibidas.map(normalizar).filter(Boolean))];
  const out: Coincidencia[] = [];
  for (const s of segmentos) {
    const texto = ` ${normalizar(s.texto)} `;
    for (const p of lista) {
      let desde = 0;
      for (;;) {
        const i = texto.indexOf(` ${p} `, desde);
        if (i < 0) break;
        // Ubica la palabra dentro del tramo en proporción a su posición en el texto.
        const frac = texto.length > 2 ? i / (texto.length - 2) : 0;
        out.push({ palabra: p, segundo: Math.floor(s.inicio + (s.fin - s.inicio) * frac), contexto: s.texto.trim() });
        desde = i + p.length + 1;
      }
    }
  }
  return out.sort((a, b) => a.segundo - b.segundo || a.palabra.localeCompare(b.palabra));
}

export type Estado = 'aprobado' | 'en_revision' | 'rechazado';

export interface Decision {
  estado: Estado;
  motivo: string | null;
}

export interface Reglas {
  duracionMaximaSegundos: number;
  /** Qué pasa al encontrar una palabra prohibida. Decisión 2026-11-19: 'revision'. */
  alEncontrarPalabra: 'revision' | 'rechazo';
}

/** Tolerancia de la medición: un spot de 40 s exactos suele medir 40,02 s por el relleno del códec. */
export const MARGEN_MS = 250;

/**
 * La decisión automática. La duración es un dato exacto: si pasa del máximo, se rechaza. Sin transcripción (Whisper
 * no instalado o falló) no se puede afirmar que esté limpio: va a revisión humana.
 */
export function decidir(r: Reglas, duracionMs: number, coincidencias: Coincidencia[] | null): Decision {
  if (duracionMs > r.duracionMaximaSegundos * 1000 + MARGEN_MS) {
    const s = (duracionMs / 1000).toFixed(1).replace('.', ',');
    return { estado: 'rechazado', motivo: `Dura ${s} s y el máximo es ${r.duracionMaximaSegundos} s. Recórtalo y súbelo de nuevo.` };
  }
  if (coincidencias === null) return { estado: 'en_revision', motivo: 'Sin transcripción automática: una persona lo escucha.' };
  if (coincidencias.length > 0) {
    const unicas = [...new Set(coincidencias.map((c) => c.palabra))];
    const lista = unicas.slice(0, 5).map((p) => `«${p}»`).join(', ');
    if (r.alEncontrarPalabra === 'rechazo') return { estado: 'rechazado', motivo: `Contiene palabras no permitidas al aire: ${lista}.` };
    return { estado: 'en_revision', motivo: `Una persona lo revisa: se oyó ${lista}.` };
  }
  return { estado: 'aprobado', motivo: null };
}

/** El formato por la extensión del nombre del archivo; null si no se acepta. */
export function formatoDe(nombre: string): Formato | null {
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  return (FORMATOS as readonly string[]).includes(ext) ? (ext as Formato) : null;
}
