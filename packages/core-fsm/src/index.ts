/**
 * Máquinas de estado con guardas (patrón de ContentSniper). Ningún estado se cambia escribiendo el campo a mano:
 * se pide la transición por su evento y, si no está permitida desde el estado actual, se lanza TransicionInvalida.
 * Las pruebas recorren la tabla completa, así un paso prohibido (pagar un pedido vencido) no se cuela.
 */
export class TransicionInvalida extends Error {
  constructor(
    readonly maquina: string,
    readonly desde: string,
    readonly evento: string,
  ) {
    super(`${maquina}: «${evento}» no está permitido desde «${desde}»`);
  }
}

export interface Maquina<E extends string, V extends string> {
  nombre: string;
  /** Estado al que lleva el evento, o lanza si no está permitido. */
  siguiente(desde: E, evento: V): E;
  puede(desde: E, evento: V): boolean;
  /** Estados desde los que el evento está permitido (para usarlos en un WHERE y evitar carreras). */
  origenes(evento: V): E[];
  finales: readonly E[];
}

export function crearMaquina<E extends string, V extends string>(
  nombre: string,
  tabla: Record<E, Partial<Record<V, E>>>,
): Maquina<E, V> {
  const estados = Object.keys(tabla) as E[];
  return {
    nombre,
    siguiente(desde, evento) {
      const a = tabla[desde]?.[evento];
      if (!a) throw new TransicionInvalida(nombre, desde, evento);
      return a;
    },
    puede: (desde, evento) => Boolean(tabla[desde]?.[evento]),
    origenes: (evento) => estados.filter((e) => tabla[e][evento] !== undefined),
    finales: estados.filter((e) => Object.keys(tabla[e]).length === 0),
  };
}

// ── pedido ──────────────────────────────────────────────────────────────────
// PT-3 cubre reservar, cancelar, vencer y pagar. Programación, emisión y certificado se añaden en sus PT.
export type EstadoPedido = 'reservado' | 'pagado' | 'cancelado' | 'vencido';
export type EventoPedido = 'pagar' | 'cancelar' | 'vencer';

export const pedido = crearMaquina<EstadoPedido, EventoPedido>('pedido', {
  reservado: { pagar: 'pagado', cancelar: 'cancelado', vencer: 'vencido' },
  pagado: {},
  cancelado: {},
  vencido: {},
});

// ── cotización ──────────────────────────────────────────────────────────────
export type EstadoCotizacion = 'vigente' | 'en_aprobacion' | 'rechazada' | 'reservada';
export type EventoCotizacion = 'aprobar' | 'rechazar' | 'reservar';

export const cotizacion = crearMaquina<EstadoCotizacion, EventoCotizacion>('cotización', {
  vigente: { reservar: 'reservada' },
  en_aprobacion: { aprobar: 'vigente', rechazar: 'rechazada' },
  rechazada: {},
  reservada: {},
});
