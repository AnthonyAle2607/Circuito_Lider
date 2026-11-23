import type Anthropic from '@anthropic-ai/sdk';

/**
 * Lo que cuesta un turno, en millonésimas de dólar (P9: todo gasto del agente tiene tope). Tarifas de Claude Opus 5.5
 * por millón de tokens: entrada $4, salida $20, lectura de caché $0,20, escritura de caché (5 min) $5.
 * Si cambia el modelo o la tarifa, se cambia aquí.
 */
export const TARIFA_MICRO_USD_POR_TOKEN = { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 } as const;

export interface Uso {
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura: number;
}

export const usoVacio = (): Uso => ({ entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 });

export function sumarUso(a: Uso, u: Anthropic.Beta.BetaUsage): Uso {
  return {
    entrada: a.entrada + (u.input_tokens ?? 0),
    salida: a.salida + (u.output_tokens ?? 0),
    cacheLectura: a.cacheLectura + (u.cache_read_input_tokens ?? 0),
    cacheEscritura: a.cacheEscritura + (u.cache_creation_input_tokens ?? 0),
  };
}

export function costoMicroUsd(u: Uso): number {
  const t = TARIFA_MICRO_USD_POR_TOKEN;
  return Math.ceil(u.entrada * t.entrada + u.salida * t.salida + u.cacheLectura * t.cacheLectura + u.cacheEscritura * t.cacheEscritura);
}
