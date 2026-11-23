import type { Generated } from 'kysely';
import type { Ahora } from './comun';

/** Migración 0002: circuito, emisoras, programas y franjas. */
export interface CircuitosTabla {
  id: Generated<string>;
  nombre: string;
  creado_at: Generated<Date>;
}

export interface EmisorasTabla {
  id: Generated<string>;
  circuito_id: string;
  slug: string;
  nombre: string;
  ciudad: string;
  frecuencia: string;
  zona_horaria: Generated<string>;
  activa: Generated<boolean>;
  creado_at: Generated<Date>;
  stream_url: string | null;
  descripcion: string | null;
}

export interface ProgramasTabla {
  id: Generated<string>;
  circuito_id: string;
  emisora_id: string | null;
  nombre: string;
  alcance: 'nacional' | 'local';
  descripcion: string | null;
  locutores: string | null;
  activo: Generated<boolean>;
  creado_at: Generated<Date>;
}

export interface FranjasTabla {
  id: Generated<string>;
  programa_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  segundos_tanda: number;
  activa: Generated<boolean>;
  cupo_confirmado: Generated<boolean>;
  actualizado_at: Ahora;
  creado_at: Generated<Date>;
}
