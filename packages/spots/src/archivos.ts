import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Reglas } from './reglas';

const ConfigSpots = z.object({
  duracion_maxima_segundos: z.number().int().min(5).max(300),
  formatos_aceptados: z.array(z.enum(['mp4', 'mp3', 'wav'])).min(1),
  al_encontrar_palabra: z.enum(['revision', 'rechazo']),
});

/** `config/spots.yaml`: duración máxima, formatos y qué hacer con una palabra prohibida. */
export function leerReglas(ruta: string): Reglas & { formatos: string[] } {
  const c = ConfigSpots.parse(parse(readFileSync(ruta, 'utf8')));
  return { duracionMaximaSegundos: c.duracion_maxima_segundos, alEncontrarPalabra: c.al_encontrar_palabra, formatos: c.formatos_aceptados };
}

const ArchivoPalabras = z.record(z.string(), z.array(z.string().min(1).max(80)));

/** `datos/palabras-prohibidas.yaml`: la lista inicial por categoría. */
export function leerPalabras(ruta: string): Array<{ palabra: string; categoria: string }> {
  const a = ArchivoPalabras.parse(parse(readFileSync(ruta, 'utf8')));
  return Object.entries(a).flatMap(([categoria, ps]) => ps.map((palabra) => ({ palabra, categoria })));
}
