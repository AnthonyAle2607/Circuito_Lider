import { z } from 'zod';
import { Pago } from './pagos';

const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha AAAA-MM-DD');
const Uuid = z.string().uuid();

// ── disponibilidad ──────────────────────────────────────────────────────────
export const ConsultaDisponibilidad = z.object({
  emisora: z.string().regex(/^[a-z0-9-]{2,40}$/),
  desde: Fecha,
  dias: z.coerce.number().int().min(1).max(31).default(7),
});

export const Disponible = z.object({
  franjaId: z.string(),
  fecha: z.string(),
  programa: z.string(),
  alcance: z.enum(['nacional', 'local']),
  inicio: z.string(),
  fin: z.string(),
  capacidad: z.number().int(),
  libres: z.number().int(),
  cupoConfirmado: z.boolean(),
});
export type Disponible = z.infer<typeof Disponible>;

// ── cotización ──────────────────────────────────────────────────────────────
export const PedirCotizacion = z.object({
  duracionSegundos: z.number().int().min(10).max(120),
  emisiones: z.array(z.object({ franjaId: Uuid, fecha: Fecha })).min(1).max(500),
});
export type PedirCotizacion = z.infer<typeof PedirCotizacion>;

export const EstadoCotizacion = z.enum(['vigente', 'en_aprobacion', 'rechazada', 'reservada', 'vencida']);

export const Cotizacion = z.object({
  id: z.string(),
  estado: EstadoCotizacion,
  venceAt: z.string(),
  moneda: z.string(),
  /** true = precios de ejemplo, no reales. El portal debe avisarlo. */
  esEjemplo: z.boolean(),
  tarifarioVersion: z.number().int(),
  duracionSegundos: z.number().int(),
  emisiones: z.number().int(),
  subtotalCentimos: z.number().int(),
  descuentoBps: z.number().int(),
  descuentoCentimos: z.number().int(),
  totalCentimos: z.number().int(),
  requiereAprobacion: z.boolean(),
  lineas: z.array(
    z.object({
      franjaId: z.string(),
      fecha: z.string(),
      programa: z.string(),
      alcance: z.enum(['nacional', 'local']),
      /** Ciudad de la emisora, o «10 emisoras» si es en cadena. */
      donde: z.string(),
      inicio: z.string(),
      fin: z.string(),
      precioCentimos: z.number().int(),
    }),
  ),
});
export type Cotizacion = z.infer<typeof Cotizacion>;

// ── reserva y pedido ────────────────────────────────────────────────────────
export const Reservar = z.object({
  aceptaTerminos: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar los términos para reservar.' }) }),
  terminosVersion: z.string().min(1).max(60),
});

export const EstadoPedido = z.enum(['reservado', 'pagado', 'cancelado', 'vencido']);

export const Pedido = z.object({
  id: z.string(),
  estado: EstadoPedido,
  cotizacionId: z.string(),
  moneda: z.string(),
  totalCentimos: z.number().int(),
  reservaVenceAt: z.string(),
  creadoAt: z.string(),
  /** El spot asignado a la campaña (PT-7); null mientras el cliente no elija uno. */
  anuncioId: z.string().nullable().default(null),
  reservas: z.array(z.object({ franjaId: z.string(), fecha: z.string(), segundos: z.number().int(), estado: z.enum(['retenida', 'confirmada', 'liberada']) })),
  /** Intentos de pago del pedido, el más reciente primero (PT-5). */
  pagos: z.array(Pago).default([]),
  /** Órdenes de pauta vivas por emisora y cuántas ya cargó programación (RF-22: «Programado»). */
  programacion: z.object({ ordenes: z.number().int(), cargadas: z.number().int() }).default({ ordenes: 0, cargadas: 0 }),
});
export type Pedido = z.infer<typeof Pedido>;

export const ResumenPedido = Pedido.omit({ reservas: true, anuncioId: true, pagos: true, programacion: true }).extend({ emisiones: z.number().int() });
export type ResumenPedido = z.infer<typeof ResumenPedido>;

// ── panel de ventas ─────────────────────────────────────────────────────────
export const DecisionAprobacion = z.object({
  decision: z.enum(['aprobar', 'rechazar']),
  motivo: z.string().trim().min(3).max(1000),
});

export const AsignarAnuncio = z.object({ anuncioId: z.string().uuid() });
