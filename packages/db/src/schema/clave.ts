import type { Generated } from 'kysely';

/** Migración 0013: códigos para restablecer la clave (solo su hash). */
export interface RecuperacionesClaveTabla {
  id: Generated<string>;
  usuario_id: string;
  codigo_hash: Buffer;
  vence_at: Date;
  usado_at: Date | null;
  ip: string | null;
  creado_at: Generated<Date>;
}
