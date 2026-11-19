import { z } from 'zod';

export const EstadoAnuncio = z.enum(['procesando', 'aprobado', 'en_revision', 'rechazado']);
export type EstadoAnuncio = z.infer<typeof EstadoAnuncio>;

export const Coincidencia = z.object({ palabra: z.string(), segundo: z.number().int(), contexto: z.string() });

/** Un spot del anunciante y en qué punto está su revisión. */
export const Anuncio = z.object({
  id: z.string(),
  nombre: z.string(),
  archivoNombre: z.string(),
  formato: z.enum(['mp4', 'mp3', 'wav']),
  bytes: z.number().int(),
  duracionMs: z.number().int().nullable(),
  estado: EstadoAnuncio,
  motivo: z.string().nullable(),
  transcripcion: z.string().nullable(),
  coincidencias: z.array(Coincidencia),
  creadoAt: z.string(),
  actualizadoAt: z.string(),
});
export type Anuncio = z.infer<typeof Anuncio>;

/** Lo que ve el equipo al revisar. */
export const AnuncioEnRevision = z.object({
  id: z.string(),
  empresa: z.string(),
  nombre: z.string(),
  archivoNombre: z.string(),
  formato: z.enum(['mp4', 'mp3', 'wav']),
  duracionMs: z.number().int().nullable(),
  motivo: z.string().nullable(),
  transcripcion: z.string().nullable(),
  coincidencias: z.array(Coincidencia),
  creadoAt: z.string(),
});
export type AnuncioEnRevision = z.infer<typeof AnuncioEnRevision>;

export const DecisionAnuncio = z.object({
  decision: z.enum(['aprobar', 'rechazar']),
  /** Lo que lee el cliente: obligatorio al rechazar, para que sepa qué cambiar. */
  motivo: z.string().trim().max(1000).default(''),
}).refine((d) => d.decision === 'aprobar' || d.motivo.length >= 5, { message: 'Explica al cliente qué debe cambiar (al menos 5 letras).', path: ['motivo'] });

/** Constancia de que el spot sonó: emisora, hora exacta y el recorte del audio grabado. No se borra nunca. */
export const Certificado = z.object({
  id: z.string(),
  pedidoId: z.string(),
  anuncio: z.object({ id: z.string(), nombre: z.string() }),
  emisora: z.object({ nombre: z.string(), ciudad: z.string(), frecuencia: z.string() }),
  /** Instante en que empezó a sonar (hora del streaming de la emisora). */
  emitidoAt: z.string(),
  duracionMs: z.number().int(),
  /** 0–1: cuánto se parece lo grabado a la huella del spot (sobre 0,7 es una coincidencia clara). */
  parecido: z.number(),
  /** Huella SHA-256 del recorte, para comprobar que el audio no se alteró. */
  sha256: z.string(),
  creadoAt: z.string(),
});
export type Certificado = z.infer<typeof Certificado>;
