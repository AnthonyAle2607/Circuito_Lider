/**
 * Lo puro del grabador: los argumentos de ffmpeg, leer su lista de bloques terminados y decidir qué se borra.
 */

export interface Emisora {
  id: string;
  slug: string;
  streamUrl: string;
}

/**
 * ffmpeg copia la señal tal cual (sin recomprimir: AAC o MP3 a 64 kbps según la emisora) en bloques de `segundos`,
 * alineados con el reloj (a la hora en punto). Matroska acepta los dos códecs. Al cerrar cada bloque, ffmpeg agrega
 * una línea «archivo,inicio,fin» (segundos desde que arrancó) a la lista CSV.
 */
export function argumentosFfmpeg(e: Emisora, carpeta: string, lista: string, segundos: number): string[] {
  return [
    '-nostdin',
    '-v', 'error',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '30',
    '-i', e.streamUrl,
    '-map', '0:a',
    '-c', 'copy',
    '-f', 'segment',
    '-segment_time', String(segundos),
    '-segment_atclocktime', '1',
    '-reset_timestamps', '1',
    '-strftime', '1',
    '-segment_list', lista,
    '-segment_list_type', 'csv',
    '-segment_format', 'matroska',
    `${carpeta}/%Y%m%d-%H%M%S.mka`,
  ];
}

export interface BloqueTerminado {
  archivo: string;
  inicioS: number;
  finS: number;
}

/** Lee la lista CSV de ffmpeg (puede tener una última línea a medio escribir: se ignora). */
export function leerLista(texto: string): BloqueTerminado[] {
  const out: BloqueTerminado[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^"?([^",]+)"?,([\d.]+),([\d.]+)$/.exec(linea.trim());
    if (!m) continue;
    const inicioS = Number(m[2]);
    const finS = Number(m[3]);
    if (finS > inicioS) out.push({ archivo: m[1]!.replace(/^.*[\\/]/, ''), inicioS, finS });
  }
  return out;
}

/**
 * Hora real de un bloque. ffmpeg nombra cada bloque con la hora del reloj en que lo abrió (hora local del equipo, la
 * misma con la que corre este proceso): es la referencia más fiel. El desfase de la lista cuenta tiempo de audio desde
 * que conectó, y al conectar el streaming manda varios segundos de golpe, así que solo se usa si el nombre no sirve.
 * El fin es el inicio más lo que dura el bloque.
 */
export function horasDelBloque(arranque: Date, b: BloqueTerminado): { inicio: Date; fin: Date } {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\./.exec(b.archivo);
  const inicio = m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : new Date(arranque.getTime() + b.inicioS * 1000);
  return { inicio, fin: new Date(inicio.getTime() + (b.finS - b.inicioS) * 1000) };
}

/** Espera antes de reintentar una emisora caída: 10 s, 20 s, 40 s… hasta 5 minutos. */
export function espera(intentos: number): number {
  return Math.min(300_000, 10_000 * 2 ** Math.max(0, intentos - 1));
}
