import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export interface Marca {
  nombre: string;
  lema: string;
  mascota: string;
  colores: Record<'fondo' | 'superficie' | 'texto' | 'texto_suave' | 'acento' | 'alerta', string>;
}

/** La marca sale de config/marca.yaml (decisión D13): cambiarla no toca código. */
export function leerMarca(): Marca {
  const archivo = path.resolve(process.cwd(), '../../config/marca.yaml');
  return parse(readFileSync(archivo, 'utf8')) as Marca;
}
