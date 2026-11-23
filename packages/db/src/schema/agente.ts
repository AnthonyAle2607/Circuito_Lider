import type { ColumnType, Generated } from 'kysely';
import type { Ahora, Centimos } from './comun';

/** Migración 0011: conversaciones del agente vendedor, sus mensajes y el gasto diario del modelo. */
export type EstadoConversacion = 'agente' | 'traspasada' | 'cerrada';

export interface ConversacionesTabla {
  id: Generated<string>;
  token_hash: Buffer;
  anunciante_id: string | null;
  usuario_id: string | null;
  estado: Generated<EstadoConversacion>;
  prospecto: Generated<unknown>;
  cotizaciones: Generated<string[]>;
  traspaso_motivo: string | null;
  traspaso_resumen: string | null;
  traspasada_at: Date | null;
  turnos: Generated<number>;
  tokens_entrada: Generated<Centimos>;
  tokens_salida: Generated<Centimos>;
  tokens_cache_lectura: Generated<Centimos>;
  tokens_cache_escritura: Generated<Centimos>;
  costo_micro_usd: Generated<Centimos>;
  version_instrucciones: string;
  ip: string | null;
  creado_at: Generated<Date>;
  actualizado_at: Ahora;
}

export interface ConversacionMensajesTabla {
  id: Generated<string>;
  conversacion_id: string;
  orden: number;
  rol: 'user' | 'assistant' | 'system';
  contenido: unknown;
  creado_at: Generated<Date>;
}

export interface AgenteGastoDiarioTabla {
  dia: ColumnType<string, string, string>;
  costo_micro_usd: Generated<Centimos>;
}
