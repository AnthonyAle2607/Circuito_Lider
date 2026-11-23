import type { ColumnType, Generated } from 'kysely';

/** Migración 0014: órdenes de pauta por emisora (RF-20, RF-21). Los estados los cambian sus funciones. */
export type EstadoOrden = 'pendiente' | 'cargada' | 'anulada';

export interface OrdenesPautaTabla {
  id: Generated<string>;
  anunciante_id: string;
  pedido_id: string;
  emisora_id: string;
  anuncio_id: string;
  estado: ColumnType<EstadoOrden, never, never>;
  nota: ColumnType<string | null, never, never>;
  creada_at: Generated<Date>;
  cargada_at: ColumnType<Date | null, never, never>;
  cargada_por: ColumnType<string | null, never, never>;
  anulada_at: ColumnType<Date | null, never, never>;
}
