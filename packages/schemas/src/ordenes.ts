import { z } from 'zod';

/** Órdenes de pauta (0014) tal como las ve el operador de programación. */
export const EstadoOrden = z.enum(['pendiente', 'cargada', 'anulada']);

export const OrdenDePauta = z.object({
  id: z.string(),
  estado: EstadoOrden,
  emisora: z.string(),
  ciudad: z.string(),
  frecuencia: z.string(),
  empresa: z.string(),
  anuncio: z.string(),
  formato: z.string(),
  duracionMs: z.number().int().nullable(),
  pedidoId: z.string(),
  creadaAt: z.string(),
  cargadaAt: z.string().nullable(),
  nota: z.string().nullable(),
  lineas: z.array(z.object({ fecha: z.string(), inicio: z.string(), fin: z.string(), programa: z.string(), segundos: z.number().int() })),
});
export type OrdenDePauta = z.infer<typeof OrdenDePauta>;

export const ConfirmarOrden = z.object({ nota: z.string().trim().max(500).optional() });
