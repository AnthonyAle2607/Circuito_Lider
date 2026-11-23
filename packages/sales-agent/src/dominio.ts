/**
 * Lo que el agente puede hacer en el sistema. La API lo implementa con las MISMAS funciones de dominio que usan sus
 * rutas (P11: el agente no tiene más poder que el portal). El paquete no conoce la base ni la red: solo esta interfaz,
 * y por eso se puede probar con un dominio falso.
 */
export type Alcance = 'nacional' | 'local';

export interface EmisoraResumen {
  slug: string;
  nombre: string;
  ciudad: string;
  frecuencia: string;
}

export interface ProgramaDeParrilla {
  nombre: string;
  alcance: Alcance;
  descripcion: string | null;
  /** dia: 1 = lunes … 7 = domingo; horas HH:MM de Venezuela. */
  franjas: Array<{ id: string; dia: number; inicio: string; fin: string }>;
}

export interface Tarifas {
  moneda: string;
  esEjemplo: boolean;
  duraciones: number[];
  /** Precio por emisión en centavos, por alcance y duración. */
  precios: Array<{ alcance: Alcance; duracionSegundos: number; centimos: number }>;
  /** Descuento automático por volumen: desde N emisiones, X puntos básicos (500 = 5 %). */
  descuentos: Array<{ desdeEmisiones: number; bps: number }>;
  /** Desde este total, una persona de ventas aprueba la cotización antes de reservar. */
  umbralAprobacionCentimos: number;
}

export interface Libre {
  franjaId: string;
  fecha: string;
  programa: string;
  inicio: string;
  libres: number;
  capacidad: number;
}

export type ResultadoCotizacion =
  | { ok: true; id: string; totalCentimos: number; moneda: string; emisiones: number; descuentoBps: number; requiereAprobacion: boolean; venceAt: string; enlace: string }
  | { ok: false; error: string; mensaje: string };

export interface Dominio {
  emisoras(): Promise<EmisoraResumen[]>;
  parrilla(slug: string): Promise<ProgramaDeParrilla[] | null>;
  tarifas(): Promise<Tarifas | null>;
  cupos(slug: string, desde: string, dias: number): Promise<Libre[] | null>;
  cotizar(d: { duracionSegundos: number; emisiones: Array<{ franjaId: string; fecha: string }> }): Promise<ResultadoCotizacion>;
}
