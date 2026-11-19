import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'hora HH:MM (24:00 vale como fin del día)');

const FranjaArchivo = z
  .object({ dias: z.array(z.number().int().min(1).max(7)).min(1), inicio: Hora, fin: Hora })
  .refine((f) => f.fin > f.inicio, { message: 'la franja debe terminar después de empezar (parte la que cruza la medianoche)' });

const ProgramaArchivo = z.object({
  nombre: z.string().min(1).max(160),
  locutores: z.string().max(300).optional(),
  descripcion: z.string().min(1).max(1000).optional(),
  franjas: z.array(FranjaArchivo).min(1),
});

/** El archivo `datos/<circuito>.yaml`: la parrilla tal como la publica la emisora. */
export const ArchivoParrilla = z
  .object({
    circuito: z.string().min(1),
    segundos_por_hora: z.number().int().min(0).max(3600),
    emisoras: z
      .array(
        z.object({
          slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
          nombre: z.string().min(1),
          ciudad: z.string().min(1),
          frecuencia: z.string().regex(/^[0-9]{2,3}\.[0-9] FM$/),
          /** Señal en vivo (Icecast/HTTP). Solo https: el portal no puede cargar audio inseguro. */
          stream: z.string().regex(/^https:\/\/\S+$/, 'la señal debe ser https://').max(300).optional(),
          descripcion: z.string().min(1).max(1000).optional(),
        }),
      )
      .min(1),
    nacionales: z.array(ProgramaArchivo).default([]),
    locales: z.record(z.string(), z.array(ProgramaArchivo)).default({}),
  })
  .superRefine((a, ctx) => {
    const slugs = new Set(a.emisoras.map((e) => e.slug));
    for (const s of Object.keys(a.locales)) {
      if (!slugs.has(s)) ctx.addIssue({ code: 'custom', path: ['locales', s], message: `no hay emisora «${s}»` });
    }
  });
export type ArchivoParrilla = z.infer<typeof ArchivoParrilla>;

export function leerArchivoParrilla(ruta: string): ArchivoParrilla {
  return ArchivoParrilla.parse(parse(readFileSync(ruta, 'utf8')));
}

/** Minutos desde la medianoche; «24:00» = 1440. */
export function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h! * 60 + m!;
}

/** Segundos de tanda estimados para una franja, proporcionales a su duración. */
export function segundosEstimados(inicio: string, fin: string, segundosPorHora: number): number {
  return Math.round(((minutos(fin) - minutos(inicio)) / 60) * segundosPorHora);
}
