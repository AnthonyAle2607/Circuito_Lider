/** Fechas «AAAA-MM-DD» en hora de Venezuela (UTC−4 todo el año), sin depender de la zona del navegador. */

export function hoyEnCaracas(ahora = new Date()): string {
  return new Date(ahora.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 1 = lunes … 7 = domingo. */
export function diaIso(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Los próximos `n` lunes desde hoy (si hoy es lunes, el siguiente). */
export function proximosLunes(n: number, hoy = hoyEnCaracas()): string[] {
  let f = sumarDias(hoy, 1);
  while (diaIso(f) !== 1) f = sumarDias(f, 1);
  return Array.from({ length: n }, (_, i) => sumarDias(f, i * 7));
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** «lun 23 nov» */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${DIAS[diaIso(fecha) - 1]} ${d} ${MESES[m! - 1]}`;
}

export function dinero(centimos: number, moneda = 'USD'): string {
  const v = centimos / 100;
  const s = v.toLocaleString('es-VE', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$${s}` : `${s} ${moneda}`;
}
