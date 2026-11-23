import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

/** config/agente.yaml: topes de gasto y de uso del agente (P9). */
const Archivo = z.object({
  topes: z.object({
    por_turno_usd: z.number().positive(),
    por_conversacion_usd: z.number().positive(),
    por_dia_usd: z.number().positive(),
    turnos: z.number().int().positive(),
    largo_mensaje: z.number().int().min(100).max(10000),
  }),
});

export interface ConfigAgente {
  topeTurnoMicroUsd: number;
  topeConversacionMicroUsd: number;
  topeDiaMicroUsd: number;
  turnos: number;
  largoMensaje: number;
}

const micro = (usd: number) => Math.round(usd * 1_000_000);

export function leerConfigAgente(ruta: string): ConfigAgente {
  const t = Archivo.parse(parse(readFileSync(ruta, 'utf8'))).topes;
  return { topeTurnoMicroUsd: micro(t.por_turno_usd), topeConversacionMicroUsd: micro(t.por_conversacion_usd), topeDiaMicroUsd: micro(t.por_dia_usd), turnos: t.turnos, largoMensaje: t.largo_mensaje };
}
