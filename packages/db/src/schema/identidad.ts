import type { ColumnType, Generated } from 'kysely';
import type { Ahora, Bytes, EstadoCuenta, RolEquipo, TipoSesion } from './comun';

/** Migración 0001: anunciantes, usuarios, equipo y sesiones. */
export interface AnunciantesTabla {
  id: string;
  empresa: string;
  pais: string;
  zona_horaria: Generated<string>;
  estado: Generated<EstadoCuenta>;
  creado_at: Generated<Date>;
  id_fiscal: string | null;
  sector: string | null;
  sitio_web: string | null;
  telefono: string | null;
  direccion: string | null;
  actualizado_at: Date | null;
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
