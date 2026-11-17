import type { ColumnType, Generated } from 'kysely';

/**
 * Tipos de las tablas para Kysely. Cada migración añade aquí sus tablas en el mismo cambio que el SQL.
 * `Generated` = lo pone la base; `ColumnType<Lee, Inserta, Actualiza>` cuando difieren.
 */
type Ahora = ColumnType<Date, Date | string | undefined, Date | string>;
type Bytes = Buffer;

export type EstadoCuenta = 'activa' | 'suspendida' | 'cerrada';
export type RolEquipo = 'ventas' | 'revisor' | 'programacion' | 'finanzas' | 'gerencia' | 'admin';
export type TipoSesion = 'anunciante' | 'equipo';
export type TipoActor = 'anunciante' | 'equipo' | 'agente' | 'sistema';

// ── 0001 identidad ──────────────────────────────────────────────────────────
export interface AnunciantesTabla {
  id: string;
  empresa: string;
  pais: string;
  zona_horaria: Generated<string>;
  estado: Generated<EstadoCuenta>;
  creado_at: Generated<Date>;
}

export interface UsuariosTabla {
  id: Generated<string>;
  anunciante_id: string;
  email: string;
  nombre: string;
  password_hash: string;
  correo_verificado_at: Date | null;
  estado: Generated<EstadoCuenta>;
  ultimo_acceso_at: Date | null;
  creado_at: Generated<Date>;
}

export interface VerificacionesCorreoTabla {
  id: Generated<string>;
  anunciante_id: string;
  usuario_id: string;
  codigo_hash: Bytes;
  expira_at: Date;
  usado_at: Date | null;
  creado_at: Generated<Date>;
}

export interface EquipoTabla {
  id: Generated<string>;
  email: string;
  nombre: string;
  password_hash: string;
  roles: RolEquipo[];
  totp_secreto_cifrado: Bytes;
  totp_ultimo_paso: ColumnType<number, number | undefined, number>;
  activo: Generated<boolean>;
  ultimo_acceso_at: Date | null;
  creado_at: Generated<Date>;
}

export interface RetosEquipoTabla {
  id: Generated<string>;
  reto_hash: Bytes;
  equipo_id: string;
  intentos: Generated<number>;
  expira_at: Date;
  usado_at: Date | null;
  creado_at: Generated<Date>;
}

export interface SesionesTabla {
  id: Generated<string>;
  token_hash: Bytes;
  tipo: TipoSesion;
  usuario_id: string | null;
  anunciante_id: string | null;
  equipo_id: string | null;
  creada_at: Generated<Date>;
  ultimo_uso_at: Ahora;
  expira_inactividad_at: Date;
  expira_absoluta_at: Date;
  revocada_at: Date | null;
  ip: string | null;
  user_agent: string | null;
}

// ── 0002 catálogo ───────────────────────────────────────────────────────────
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

// ── 0003 bitácora y outbox ──────────────────────────────────────────────────
export interface BitacoraTabla {
  id: Generated<string>;
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
  id: Generated<string>;
  anunciante_id: string | null;
  tipo: string;
  datos: ColumnType<unknown, string | undefined, string>;
  creado_at: Generated<Date>;
  despachado_at: Date | null;
  intentos: Generated<number>;
  ultimo_error: string | null;
}

export interface Database {
  anunciantes: AnunciantesTabla;
  usuarios: UsuariosTabla;
  verificaciones_correo: VerificacionesCorreoTabla;
  equipo: EquipoTabla;
  retos_equipo: RetosEquipoTabla;
  sesiones: SesionesTabla;
  circuitos: CircuitosTabla;
  emisoras: EmisorasTabla;
  programas: ProgramasTabla;
  franjas: FranjasTabla;
  bitacora: BitacoraTabla;
  outbox: OutboxTabla;
}
