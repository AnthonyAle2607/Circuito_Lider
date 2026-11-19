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
export type Alcance = 'nacional' | 'local';
export type EstadoCotizacion = 'vigente' | 'en_aprobacion' | 'rechazada' | 'reservada';
export type EstadoPedido = 'reservado' | 'pagado' | 'cancelado' | 'vencido';
export type EstadoReserva = 'retenida' | 'confirmada' | 'liberada';
/** Dinero en centavos (bigint en la base, number aquí: ver PARSERS en index.ts). */
type Centimos = number;

// ── 0001 identidad ──────────────────────────────────────────────────────────
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

// ── 0003 bitácora y outbox ──────────────────────────────────────────────────
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

// ── 0005 inventario y precios ───────────────────────────────────────────────
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

export type EstadoAnuncio = 'procesando' | 'aprobado' | 'en_revision' | 'rechazado';

export interface AnunciosTabla {
  id: Generated<string>;
  anunciante_id: string;
  subido_por: string;
  nombre: string;
  archivo_nombre: string;
  archivo_clave: string;
  formato: 'mp4' | 'mp3' | 'wav';
  bytes: number;
  duracion_ms: number | null;
  estado: Generated<EstadoAnuncio>;
  motivo: string | null;
  transcripcion: string | null;
  coincidencias: Generated<unknown>;
  intentos: Generated<number>;
  tomado_at: Date | null;
  revisado_por: string | null;
  revisado_at: Date | null;
  creado_at: Generated<Date>;
  actualizado_at: Generated<Date>;
}

export interface PalabrasProhibidasTabla {
  id: Generated<number>;
  palabra: string;
  categoria: string;
  activa: Generated<boolean>;
  creado_at: Generated<Date>;
}

export interface GrabacionesTabla {
  id: Generated<string>;
  emisora_id: string;
  archivo: string;
  inicio_at: Date;
  fin_at: Date;
  bytes: number;
  analizada_at: Date | null;
  borrada_at: Date | null;
  creado_at: Generated<Date>;
}

export interface CertificadosTabla {
  id: Generated<string>;
  anunciante_id: string;
  pedido_id: string;
  anuncio_id: string;
  reserva_id: string | null;
  emisora_id: string;
  grabacion_id: string;
  emitido_at: Date;
  duracion_ms: number;
  parecido: string;
  clip_clave: string;
  clip_sha256: Buffer;
  creado_at: Generated<Date>;
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
  tarifarios: TarifariosTabla;
  tarifas: TarifasTabla;
  descuentos_volumen: DescuentosVolumenTabla;
  cotizaciones: CotizacionesTabla;
  cotizacion_lineas: CotizacionLineasTabla;
  pedidos: PedidosTabla;
  cupos: CuposTabla;
  reservas: ReservasTabla;
  anuncios: AnunciosTabla;
  palabras_prohibidas: PalabrasProhibidasTabla;
  grabaciones: GrabacionesTabla;
  certificados: CertificadosTabla;
}
