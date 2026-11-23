/**
 * Datos de la venta, puros: de la parrilla a «productos» (programas), de la selección a fechas, filtros y paquetes.
 * Sin React ni navegador, para probarlos con Vitest (test/venta.test.ts).
 */
import type { Emisora, Parrilla } from '@sp/schemas';
import type { Tarifario } from '@sp/pricing';
import { hoyEnCaracas, sumarDias } from '../../lib/fechas';

export interface DatosVenta {
  emisoras: Emisora[];
  parrillas: Record<string, Parrilla>;
  tarifario: (Tarifario & { duraciones: number[] }) | null;
}

export type Alcance = 'nacional' | 'local';
export const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Una franja con su programa y, si es local, su emisora. */
export type Franja = Parrilla['programas'][number]['franjas'][number] & { programa: string; alcance: Alcance; emisora: string | null };

/** Un programa como «producto» de la tienda: el de cadena una vez, cada local con su emisora. */
export interface Programa {
  clave: string;
  nombre: string;
  alcance: Alcance;
  emisora: string | null;
  ciudad: string | null;
  descripcion: string | null;
  ids: string[];
  franjas: Array<{ dia: number; inicio: string; fin: string }>;
}

export interface Filtros {
  /** 'todo' | 'cadena' | slug de una emisora (sus locales y la cadena). */
  donde: string;
  /** 'cualquiera' | 'mananas' | 'tardes' | 'finde' */
  cuando: string;
}

/** Todas las franjas del circuito, una vez: las nacionales sin emisora, las locales con la suya. */
export function indexar(d: DatosVenta): Map<string, Franja> {
  const m = new Map<string, Franja>();
  for (const [slug, p] of Object.entries(d.parrillas)) {
    for (const pr of p.programas) {
      for (const f of pr.franjas) {
        if (!m.has(f.id)) m.set(f.id, { ...f, programa: pr.nombre, alcance: pr.alcance, emisora: pr.alcance === 'local' ? slug : null });
      }
    }
  }
  return m;
}

/** Los programas del circuito: primero los de cadena, después los locales por ciudad y hora. */
export function programasDe(d: DatosVenta): Programa[] {
  const m = new Map<string, Programa>();
  for (const [slug, p] of Object.entries(d.parrillas)) {
    for (const pr of p.programas) {
      const nac = pr.alcance === 'nacional';
      const clave = nac ? `cadena:${pr.nombre}` : `${slug}:${pr.nombre}`;
      if (m.has(clave)) continue;
      m.set(clave, {
        clave,
        nombre: pr.nombre,
        alcance: pr.alcance,
        emisora: nac ? null : slug,
        ciudad: nac ? null : p.emisora.ciudad,
        descripcion: pr.descripcion,
        ids: pr.franjas.map((f) => f.id),
        franjas: pr.franjas,
      });
    }
  }
  const primera = (x: Programa) => [...x.franjas].sort((a, b) => a.inicio.localeCompare(b.inicio))[0]?.inicio ?? '';
  return [...m.values()].sort((a, b) =>
    a.alcance !== b.alcance ? (a.alcance === 'nacional' ? -1 : 1) : (a.ciudad ?? '').localeCompare(b.ciudad ?? '') || primera(a).localeCompare(primera(b)),
  );
}

/**
 * ¿El programa entra en los filtros? La madrugada (00:00–05:00) cuenta como noche: es la cola de los programas
 * nocturnos, no una mañana.
 */
export function pasaFiltros(x: Programa, { donde, cuando }: Filtros): boolean {
  if (donde === 'cadena' && x.alcance !== 'nacional') return false;
  if (donde !== 'todo' && donde !== 'cadena' && x.alcance === 'local' && x.emisora !== donde) return false;
  if (cuando === 'mananas') return x.franjas.some((f) => f.inicio >= '05:00' && f.inicio < '12:00');
  if (cuando === 'tardes') return x.franjas.some((f) => f.inicio >= '12:00' || f.inicio < '05:00');
  if (cuando === 'finde') return x.franjas.some((f) => f.dia >= 6);
  return true;
}

/** Fechas concretas de las franjas elegidas: semana a semana desde el lunes elegido, solo desde mañana. */
export function emisionesDe(elegidas: Set<string>, franjas: Map<string, Franja>, lunes: string, semanas: number, hoy = hoyEnCaracas()) {
  const manana = sumarDias(hoy, 1);
  const out: Array<{ franjaId: string; fecha: string; alcance: Alcance }> = [];
  for (const id of elegidas) {
    const f = franjas.get(id);
    if (!f) continue;
    for (let w = 0; w < semanas; w++) {
      const fecha = sumarDias(lunes, f.dia - 1 + w * 7);
      if (fecha >= manana) out.push({ franjaId: id, fecha, alcance: f.alcance });
    }
  }
  return out;
}

/** El precio por spot más bajo de un alcance, en centavos (para el «desde»). */
export function desdeCentimos(t: DatosVenta['tarifario'], alcance: Alcance): number | null {
  if (!t) return null;
  const precios = t.tarifas.filter((x) => x.alcance === alcance).map((x) => x.precioCentimos);
  return precios.length ? Math.min(...precios) : null;
}

export interface Paquete {
  clave: 'ciudad' | 'region' | 'nacional';
  etiqueta: string;
  nombre: string;
  desc: string;
  ids: string[];
  puntos: string[];
  destacado?: boolean;
}

/** Paquetes armados sobre la parrilla real. */
export function paquetes(franjas: Map<string, Franja>): Paquete[] {
  const todas = [...franjas.values()];
  const locales = (slugs: string[]) => todas.filter((f) => f.alcance === 'local' && slugs.includes(f.emisora!)).map((f) => f.id);
  return [
    {
      clave: 'ciudad',
      etiqueta: 'Local',
      nombre: 'Ciudad',
      desc: 'Los programas locales de Caracas.',
      ids: locales(['caracas']),
      puntos: ['Líder 94.9 Caracas', 'Máximo Volumen, Batita en Líder, El 3 Pack y más', 'Comercial de 30 s', 'Certificado de transmisión'],
    },
    {
      clave: 'region',
      etiqueta: 'Regional',
      nombre: 'Región',
      desc: 'Las ciudades con programación local propia.',
      ids: locales(['caracas', 'merida', 'maracaibo']),
      puntos: ['Caracas, Mérida y Maracaibo', 'Todos sus programas locales', 'Comercial de 30 s', 'Certificado de transmisión'],
      destacado: true,
    },
    {
      clave: 'nacional',
      etiqueta: 'Nacional',
      nombre: 'Red completa',
      desc: 'Programas en cadena, en las 10 ciudades a la vez.',
      ids: todas.filter((f) => f.alcance === 'nacional').map((f) => f.id),
      puntos: ['10 emisoras con un solo spot', 'ENCENDIDOS, CONVOCADOS y AL AIRE', 'De lunes a viernes', 'Certificado de transmisión'],
    },
  ];
}

/** Lleva a una sección de la página respetando a quien prefiere menos movimiento. */
export const irA = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
