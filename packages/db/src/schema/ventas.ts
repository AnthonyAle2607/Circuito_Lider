import type { ColumnType, Generated } from 'kysely';
import type { Ahora, Centimos, Alcance, EstadoCotizacion, EstadoPedido, EstadoReserva } from './comun';

/** Migración 0005: tarifarios, cotizaciones, pedidos, cupos y reservas. */
export interface TarifariosTabla {
  id: Generated<string>;
  version: number;
  moneda: string;
  vigente_desde: ColumnType<Date, Date | string, never>;
  vigencia_cotizacion_horas: number;
  reserva_horas: number;
  umbral_aprobacion_centimos: Centimos;
  es_ejemplo: Generated<boolean>;
  notas: string | null;
  creado_por: string | null;
  creado_at: Generated<Date>;
}

export interface TarifasTabla {
  tarifario_id: string;
  alcance: Alcance;
  duracion_segundos: number;
  precio_centimos: Centimos;
}

export interface DescuentosVolumenTabla {
  tarifario_id: string;
  min_emisiones: number;
  descuento_bps: number;
}

export interface CotizacionesTabla {
  id: Generated<string>;
  tarifario_id: string;
  moneda: string;
  duracion_segundos: number;
  emisiones: number;
  subtotal_centimos: Centimos;
  descuento_centimos: Centimos;
  total_centimos: Centimos;
  estado: ColumnType<EstadoCotizacion, EstadoCotizacion | undefined, EstadoCotizacion>;
  requiere_aprobacion: ColumnType<boolean, boolean | undefined, never>;
  vence_at: Date;
  decidido_por: string | null;
  decidido_at: Date | null;
  motivo_decision: string | null;
  ip: string | null;
  creado_at: Generated<Date>;
  /** Conversación del agente que la creó (0011, P12); null si la creó el portal. */
  conversacion_id: ColumnType<string | null, string | null | undefined, never>;
}

export interface CotizacionLineasTabla {
  cotizacion_id: string;
  franja_id: string;
  fecha: ColumnType<string, string, never>;
  precio_centimos: Centimos;
}

export interface PedidosTabla {
  id: Generated<string>;
  anunciante_id: string;
  cotizacion_id: string;
  usuario_id: string;
  estado: ColumnType<EstadoPedido, EstadoPedido | undefined, EstadoPedido>;
  moneda: string;
  total_centimos: Centimos;
  reserva_vence_at: Date;
  terminos_version: string;
  terminos_aceptados_at: Date;
  creado_at: Generated<Date>;
  /** El spot que suena en esta campaña (PT-7). */
  anuncio_id: Generated<string | null>;
  actualizado_at: Ahora;
}

export interface CuposTabla {
  franja_id: string;
  fecha: ColumnType<string, string, never>;
  segundos_usados: ColumnType<number, number | undefined, number>;
}

export interface ReservasTabla {
  id: Generated<string>;
  anunciante_id: string;
  pedido_id: string;
  franja_id: string;
  fecha: ColumnType<string, string, never>;
  segundos: number;
  estado: ColumnType<EstadoReserva, EstadoReserva | undefined, EstadoReserva>;
  creado_at: Generated<Date>;
  liberada_at: Date | null;
}
