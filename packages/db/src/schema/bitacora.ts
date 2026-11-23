import type { ColumnType, Generated } from 'kysely';
import type { Bytes, TipoActor } from './comun';

/** Migración 0003: bitácora encadenada y outbox. */
export interface BitacoraTabla {
  id: Generated<number>;
  anunciante_id: string | null;
  actor_tipo: TipoActor;
  actor_id: string | null;
  actor_nombre: string | null;
  accion: string;
  entidad: string;
  entidad_id: string;
  datos: ColumnType<unknown, string | undefined, never>;
  ip: string | null;
  hash_prev: Generated<Bytes | null>;
  hash: Generated<Bytes>;
  ts: Generated<Date>;
}

export interface OutboxTabla {
  id: Generated<number>;
  anunciante_id: string | null;
  tipo: string;
  datos: ColumnType<unknown, string | undefined, string>;
  creado_at: Generated<Date>;
  despachado_at: Date | null;
  intentos: Generated<number>;
  ultimo_error: string | null;
}
