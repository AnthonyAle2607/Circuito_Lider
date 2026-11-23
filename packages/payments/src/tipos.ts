/**
 * Contrato de una pasarela de pago (D11). El sistema solo conoce esta interfaz: cambiar de proveedor es escribir otro
 * adaptador, no tocar las rutas. La pasarela aloja el pago (la tarjeta nunca pasa por nuestros servidores, P6) y avisa
 * del resultado con un mensaje firmado; si el aviso se pierde, la conciliación le pregunta.
 */

/** Estado de un pago visto desde la pasarela. */
export type EstadoExterno = 'pendiente' | 'aprobado' | 'rechazado' | 'expirado';

export interface PedirSesion {
  /** Nuestro id del pago: viaja a la pasarela para cruzar el aviso con el pago. */
  pagoId: string;
  montoCentimos: number;
  moneda: string;
  descripcion: string;
  /** A dónde vuelve el cliente al pagar o al desistir. */
  urlExito: string;
  urlCancelar: string;
  /** La sesión no debe durar más que la reserva del pedido. */
  venceAt: Date;
}

export interface Sesion {
  /** Id de la sesión en la pasarela; es único por proveedor y sirve para conciliar. */
  referencia: string;
  /** Página de pago alojada por la pasarela. */
  url: string;
  venceAt: Date;
}

/** Un aviso (webhook) ya verificado: la firma es válida y el cuerpo se entendió. */
export interface Aviso {
  /** Id único del evento en la pasarela (P5: repetirlo no hace nada). */
  eventoId: string;
  tipo: string;
  referencia: string;
  estado: EstadoExterno;
  montoCentimos: number;
  moneda: string;
}

export interface Pasarela {
  /** Nombre del proveedor tal como se guarda en `pagos.proveedor` y va en la ruta del aviso. */
  readonly nombre: string;
  crearSesion(p: PedirSesion): Promise<Sesion>;
  /** Comprueba la firma y lee el aviso. Lanza AvisoInvalido si no es auténtico o no se entiende. */
  verificarAviso(cabeceras: Record<string, string | string[] | undefined>, cuerpoCrudo: string): Aviso;
  /** Pregunta el estado de una sesión (conciliación, por si un aviso se perdió). */
  consultar(referencia: string): Promise<{ estado: EstadoExterno; montoCentimos: number; moneda: string }>;
}

export class AvisoInvalido extends Error {}
