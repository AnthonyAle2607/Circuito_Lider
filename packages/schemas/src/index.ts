import { z } from 'zod';

export * from './cuentas';
export * from './catalogo';

/** Contratos compartidos por la API, el portal y el panel. Cada ruta valida su entrada y su salida con estos esquemas. */

export const Salud = z.object({
  ok: z.literal(true),
  servicio: z.string(),
  version: z.string(),
});
export type Salud = z.infer<typeof Salud>;

export const EstadoDependencia = z.enum(['ok', 'caida']);

export const Preparado = z.object({
  ok: z.boolean(),
  dependencias: z.record(z.string(), EstadoDependencia),
});
export type Preparado = z.infer<typeof Preparado>;
