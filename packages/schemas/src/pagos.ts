import { z } from 'zod';

/** Contratos de pagos (PT-5). Nunca llevan datos de tarjeta (P6): solo método, estado, monto y referencias. */
export const EstadoPago = z.enum(['pendiente', 'aprobado', 'rechazado', 'expirado']);
export type EstadoPago = z.infer<typeof EstadoPago>;
export const MetodoPago = z.enum(['pasarela', 'transferencia']);

export const Pago = z.object({
  id: z.string(),
  pedidoId: z.string(),
  metodo: MetodoPago,
  estado: EstadoPago,
  montoCentimos: z.number().int(),
  moneda: z.string(),
  /** Referencia bancaria (transferencia) o id de la sesión (pasarela). */
  referencia: z.string().nullable(),
  /** Por qué se rechazó, o la nota de un pago que llegó tarde. */
  motivo: z.string().nullable(),
  creadoAt: z.string(),
  confirmadoAt: z.string().nullable(),
});
export type Pago = z.infer<typeof Pago>;

/** Respuesta de POST /v1/pedidos/:id/pagar: la página alojada de la pasarela a la que se lleva al cliente. */
export const SesionDePago = z.object({ pagoId: z.string(), url: z.string().url(), venceAt: z.string() });
export type SesionDePago = z.infer<typeof SesionDePago>;

/** Datos bancarios para pagar por transferencia (config/pagos.yaml); los muestra el portal. */
export const DatosTransferencia = z.object({
  titular: z.string(),
  banco: z.string(),
  cuenta: z.string(),
  moneda: z.string(),
  nota: z.string(),
  esEjemplo: z.boolean(),
});
export type DatosTransferencia = z.infer<typeof DatosTransferencia>;

export const TransferenciaPorRevisar = z.object({
  id: z.string(),
  pedidoId: z.string(),
  empresa: z.string(),
  montoCentimos: z.number().int(),
  moneda: z.string(),
  referencia: z.string().nullable(),
  comprobanteNombre: z.string().nullable(),
  creadoAt: z.string(),
  reservaVenceAt: z.string(),
});
export type TransferenciaPorRevisar = z.infer<typeof TransferenciaPorRevisar>;

export const DecisionPago = z
  .object({ decision: z.enum(['aprobar', 'rechazar']), motivo: z.string().trim().max(1000).optional() })
  .refine((d) => d.decision === 'aprobar' || (d.motivo?.length ?? 0) >= 3, { message: 'Explica al cliente por qué se rechaza.', path: ['motivo'] });
