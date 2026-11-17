import { z } from 'zod';

export const Emisora = z.object({
  id: z.string(),
  slug: z.string(),
  nombre: z.string(),
  ciudad: z.string(),
  frecuencia: z.string(),
});
export type Emisora = z.infer<typeof Emisora>;

export const Franja = z.object({
  id: z.string(),
  /** ISO: 1 = lunes … 7 = domingo. */
  dia: z.number().int().min(1).max(7),
  inicio: z.string(),
  fin: z.string(),
  segundosTanda: z.number().int(),
  /** false = los segundos de tanda son estimados (falta confirmarlos con la emisora). */
  cupoConfirmado: z.boolean(),
  activa: z.boolean(),
});
export type Franja = z.infer<typeof Franja>;

export const Parrilla = z.object({
  emisora: Emisora,
  /** Las horas de la parrilla están en esta zona (America/Caracas). */
  zonaHoraria: z.string(),
  programas: z.array(
    z.object({
      id: z.string(),
      nombre: z.string(),
      alcance: z.enum(['nacional', 'local']),
      locutores: z.string().nullable(),
      franjas: z.array(Franja),
    }),
  ),
});
export type Parrilla = z.infer<typeof Parrilla>;

export const ConsultaParrilla = z.object({ emisora: z.string().regex(/^[a-z0-9-]{2,40}$/) });

const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'hora HH:MM');

/** Lo que el equipo puede corregir de una franja desde el panel. Al menos un campo. */
export const EditarFranja = z
  .object({
    inicio: Hora.optional(),
    fin: Hora.optional(),
    segundosTanda: z.number().int().min(0).max(3600).optional(),
    activa: z.boolean().optional(),
    cupoConfirmado: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'indica al menos un cambio' });
export type EditarFranja = z.infer<typeof EditarFranja>;
