import type { Parrilla } from '@sp/schemas';

/** Programa al aire, o el siguiente, en hora de Venezuela (UTC−4 todo el año). */
export interface EnAntena {
  programa: string;
  alcance: 'nacional' | 'local';
  dia: number;
  inicio: string;
  fin: string;
}

const min = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a! * 60 + b!;
};

/** Día ISO (1 = lunes) y minutos desde la medianoche en Caracas. */
export function relojCaracas(ahora = new Date()): { dia: number; minutos: number } {
  const c = new Date(ahora.getTime() - 4 * 3_600_000);
  const d = c.getUTCDay();
  return { dia: d === 0 ? 7 : d, minutos: c.getUTCHours() * 60 + c.getUTCMinutes() };
}

/**
 * Qué suena ahora y qué viene después según la parrilla publicada. Las horas sin programa son música continua
 * (`ahora` null). `despues` busca en los siete días siguientes.
 */
export function enAntena(p: Parrilla, ahora = new Date()): { ahora: EnAntena | null; despues: EnAntena | null } {
  const { dia, minutos } = relojCaracas(ahora);
  const todas: EnAntena[] = p.programas.flatMap((pr) =>
    pr.franjas.map((f) => ({ programa: pr.nombre, alcance: pr.alcance, dia: f.dia, inicio: f.inicio, fin: f.fin })),
  );
  const actual = todas.find((f) => f.dia === dia && min(f.inicio) <= minutos && minutos < min(f.fin)) ?? null;

  let despues: EnAntena | null = null;
  let mejor = Infinity;
  for (const f of todas) {
    if (f === actual) continue;
    // Minutos hasta que empiece, contando desde ahora y dando la vuelta a la semana.
    let falta = (f.dia - dia) * 1440 + min(f.inicio) - minutos;
    if (falta <= 0) falta += 7 * 1440;
    // Una franja que sigue a la actual sin pausa (Play House partido en la medianoche) no cuenta como «después».
    if (actual && f.programa === actual.programa && falta <= min(actual.fin) - minutos + 1) continue;
    if (falta < mejor) {
      mejor = falta;
      despues = f;
    }
  }
  return { ahora: actual, despues };
}

const LETRA = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRE_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Días ISO a texto corto: [1,2,3,4,5] → «L–V», [6,7] → «S y D», [3] → «miércoles», [1,3,5] → «L, X, V». */
export function textoDias(dias: number[]): string {
  const d = [...new Set(dias)].sort((a, b) => a - b);
  if (d.length === 1) return NOMBRE_DIA[d[0]!]!;
  if (d.length === 7) return 'todos los días';
  const seguidos = d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
  if (seguidos && d.length > 2) return `${LETRA[d[0]!]}–${LETRA[d[d.length - 1]!]}`;
  if (d.length === 2) return `${LETRA[d[0]!]} y ${LETRA[d[1]!]}`;
  return d.map((x) => LETRA[x]).join(', ');
}

const hora = (h: string) => (h === '24:00' ? '00:00' : h);

/** Horario legible de un programa: agrupa los días que comparten hora. «L–V · 06:00–09:00». */
export function horario(franjas: Array<{ dia: number; inicio: string; fin: string }>): string[] {
  const grupos = new Map<string, number[]>();
  for (const f of franjas) {
    const k = `${f.inicio}|${f.fin}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f.dia]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, dias]) => {
      const [i, f] = k.split('|');
      return `${textoDias(dias)} · ${hora(i!)}–${hora(f!)}`;
    });
}

/** «hoy», «mañana» o el nombre del día, visto desde Caracas. */
export function cuando(dia: number, ahora = new Date()): string {
  const hoy = relojCaracas(ahora).dia;
  if (dia === hoy) return 'hoy';
  if (dia === (hoy % 7) + 1) return 'mañana';
  return `el ${NOMBRE_DIA[dia]}`;
}
