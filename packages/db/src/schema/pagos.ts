import type { ColumnType, Generated } from 'kysely';
import type { Ahora, Centimos } from './comun';

/** Migración 0010: pagos por pasarela o transferencia y los avisos crudos de las pasarelas. */
export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'expirado';
export type MetodoPago = 'pasarela' | 'transferencia';

export interface PagosTabla {
  id: Generated<string>;
  anunciante_id: string;
  pedido_id: string;
  usuario_id: string;
  metodo: MetodoPago;
  proveedor: string;
  referencia_externa: string | null;
  monto_centimos: Centimos;
  moneda: string;
  estado: ColumnType<EstadoPago, EstadoPago | undefined, never>;
  url_pago: string | null;
  vence_at: Date | null;
  comprobante_clave: string | null;
  comprobante_nombre: string | null;
  motivo: ColumnType<string | null, never, never>;
  revisado_por: ColumnType<string | null, never, never>;
  creado_at: Generated<Date>;
  actualizado_at: Ahora;
  confirmado_at: ColumnType<Date | null, never, never>;
}

export interface WebhookEventosTabla {
  id: Generated<string>;
  proveedor: string;
  evento_id: string;
  tipo: string;
  cuerpo: unknown;
  resultado: string | null;
  recibido_at: Generated<Date>;
}
