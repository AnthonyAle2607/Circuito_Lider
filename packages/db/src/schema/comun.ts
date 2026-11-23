import type { ColumnType } from 'kysely';

/** Tipos compartidos por las tablas: fechas, bytes, dinero y los estados (enums de Postgres). */
export type Ahora = ColumnType<Date, Date | string | undefined, Date | string>;
export type Bytes = Buffer;

export type EstadoCuenta = 'activa' | 'suspendida' | 'cerrada';
export type RolEquipo = 'ventas' | 'revisor' | 'programacion' | 'finanzas' | 'gerencia' | 'admin';
export type TipoSesion = 'anunciante' | 'equipo';
export type TipoActor = 'anunciante' | 'equipo' | 'agente' | 'sistema';
export type Alcance = 'nacional' | 'local';
export type EstadoCotizacion = 'vigente' | 'en_aprobacion' | 'rechazada' | 'reservada';
export type EstadoPedido = 'reservado' | 'pagado' | 'cancelado' | 'vencido';
export type EstadoReserva = 'retenida' | 'confirmada' | 'liberada';
/** Dinero en centavos (bigint en la base, number aquí: ver PARSERS en index.ts). */
export type Centimos = number;
