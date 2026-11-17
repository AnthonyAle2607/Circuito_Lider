/**
 * Cálculo de precios. Puro: no lee la base ni la hora. Recibe el tarifario y las emisiones y devuelve importes en
 * centavos. Toda cotización, la del portal y la del agente vendedor, pasa por aquí (invariante P11): el precio nunca
 * sale del texto del modelo.
 */
export type Alcance = 'nacional' | 'local';

export interface Tarifario {
  id: string;
  version: number;
  moneda: string;
  esEjemplo: boolean;
  /** Precio por emisión, en centavos, por alcance y duración del spot. */
  tarifas: Array<{ alcance: Alcance; duracionSegundos: number; precioCentimos: number }>;
  /** Desde cuántas emisiones aplica cada descuento, en puntos básicos (500 = 5 %). */
  descuentos: Array<{ minEmisiones: number; descuentoBps: number }>;
  umbralAprobacionCentimos: number;
}

export interface Emision {
  franjaId: string;
  fecha: string;
  alcance: Alcance;
}

export interface Linea extends Emision {
  precioCentimos: number;
}

export interface Precio {
  moneda: string;
  duracionSegundos: number;
  lineas: Linea[];
  emisiones: number;
  subtotalCentimos: number;
  descuentoBps: number;
  descuentoCentimos: number;
  totalCentimos: number;
  requiereAprobacion: boolean;
}

export class SinTarifa extends Error {
  constructor(
    readonly alcance: Alcance,
    readonly duracionSegundos: number,
  ) {
    super(`El tarifario no tiene precio para un spot de ${duracionSegundos} s en franjas ${alcance === 'nacional' ? 'en cadena' : 'locales'}.`);
  }
}

/** Duraciones que el tarifario sabe cobrar (para ofrecerlas en el cotizador). */
export function duracionesDisponibles(t: Tarifario): number[] {
  const porAlcance = (a: Alcance) => new Set(t.tarifas.filter((x) => x.alcance === a).map((x) => x.duracionSegundos));
  const n = porAlcance('nacional');
  return [...porAlcance('local')].filter((d) => n.has(d)).sort((a, b) => a - b);
}

/** El descuento que corresponde a una cantidad de emisiones: el del escalón más alto alcanzado. */
export function descuentoPara(t: Tarifario, emisiones: number): number {
  return t.descuentos.filter((d) => emisiones >= d.minEmisiones).reduce((max, d) => Math.max(max, d.descuentoBps), 0);
}

export function cotizar(t: Tarifario, duracionSegundos: number, emisiones: Emision[]): Precio {
  if (emisiones.length === 0) throw new Error('La cotización necesita al menos una emisión.');
  const precio = (a: Alcance) => {
    const tarifa = t.tarifas.find((x) => x.alcance === a && x.duracionSegundos === duracionSegundos);
    if (!tarifa) throw new SinTarifa(a, duracionSegundos);
    return tarifa.precioCentimos;
  };
  const lineas = emisiones.map((e) => ({ ...e, precioCentimos: precio(e.alcance) }));
  const subtotal = lineas.reduce((s, l) => s + l.precioCentimos, 0);
  const bps = descuentoPara(t, lineas.length);
  // Se redondea hacia abajo el descuento: nunca se descuenta un centavo de más.
  const descuento = Math.floor((subtotal * bps) / 10_000);
  const total = subtotal - descuento;
  return {
    moneda: t.moneda,
    duracionSegundos,
    lineas,
    emisiones: lineas.length,
    subtotalCentimos: subtotal,
    descuentoBps: bps,
    descuentoCentimos: descuento,
    totalCentimos: total,
    requiereAprobacion: total >= t.umbralAprobacionCentimos,
  };
}
