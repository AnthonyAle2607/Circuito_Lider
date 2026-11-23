import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

/** config/pagos.yaml: datos bancarios para transferencias y el tope del comprobante (P8: lo editable es dato). */
const Archivo = z.object({
  transferencia: z.object({
    titular: z.string().min(1),
    banco: z.string().min(1),
    cuenta: z.string().min(1),
    moneda: z.string().length(3),
    nota: z.string(),
    es_ejemplo: z.boolean(),
  }),
  comprobante_max_mb: z.number().positive().max(25),
});

export interface ConfigPagos {
  transferencia: { titular: string; banco: string; cuenta: string; moneda: string; nota: string; esEjemplo: boolean };
  comprobanteMaxBytes: number;
}

export function leerConfigPagos(ruta: string): ConfigPagos {
  const a = Archivo.parse(parse(readFileSync(ruta, 'utf8')));
  const { es_ejemplo, ...t } = a.transferencia;
  return { transferencia: { ...t, esEjemplo: es_ejemplo }, comprobanteMaxBytes: Math.round(a.comprobante_max_mb * 1024 * 1024) };
}
