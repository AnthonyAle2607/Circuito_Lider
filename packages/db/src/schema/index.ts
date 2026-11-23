/**
 * Tipos de las tablas para Kysely, un archivo por dominio. Cada migración añade sus tablas en el mismo cambio que el SQL.
 * `Generated` = lo pone la base; `ColumnType<Lee, Inserta, Actualiza>` cuando difieren.
 */
import type { AnunciantesTabla, UsuariosTabla, VerificacionesCorreoTabla, EquipoTabla, RetosEquipoTabla, SesionesTabla } from './identidad';
import type { CircuitosTabla, EmisorasTabla, ProgramasTabla, FranjasTabla } from './catalogo';
import type { BitacoraTabla, OutboxTabla } from './bitacora';
import type { TarifariosTabla, TarifasTabla, DescuentosVolumenTabla, CotizacionesTabla, CotizacionLineasTabla, PedidosTabla, CuposTabla, ReservasTabla } from './ventas';
import type { AnunciosTabla, PalabrasProhibidasTabla, GrabacionesTabla, CertificadosTabla } from './anuncios';
import type { PagosTabla, WebhookEventosTabla } from './pagos';
import type { AgenteGastoDiarioTabla, ConversacionMensajesTabla, ConversacionesTabla } from './agente';
import type { RecuperacionesClaveTabla } from './clave';

export type * from './comun';
export type * from './identidad';
export type * from './catalogo';
export type * from './bitacora';
export type * from './ventas';
export type * from './anuncios';
export type * from './pagos';
export type * from './agente';
export type * from './clave';

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
  pagos: PagosTabla;
  webhook_eventos: WebhookEventosTabla;
  conversaciones: ConversacionesTabla;
  conversacion_mensajes: ConversacionMensajesTabla;
  agente_gasto_diario: AgenteGastoDiarioTabla;
  recuperaciones_clave: RecuperacionesClaveTabla;
}
