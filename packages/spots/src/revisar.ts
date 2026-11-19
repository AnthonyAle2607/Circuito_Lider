import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Almacen } from './almacen';
import { extraerAudio, medirDuracionMs, type Transcriptor } from './medios';
import { buscarPalabras, decidir, MARGEN_MS, type Coincidencia, type Decision, type Reglas } from './reglas';

export interface Resultado extends Decision {
  duracionMs: number | null;
  transcripcion: string | null;
  coincidencias: Coincidencia[];
}

export interface Herramientas {
  almacen: Almacen;
  transcriptor: Transcriptor | null;
  medir?: (archivo: string) => Promise<number>;
  extraer?: (entrada: string, salida: string) => Promise<void>;
}

/**
 * Revisa un spot de punta a punta: lo baja del almacén a una carpeta temporal, mide la duración, y si cabe, lo
 * transcribe y busca las palabras prohibidas. La carpeta se borra siempre. Un archivo ilegible queda rechazado con
 * un motivo claro para el cliente.
 */
export async function revisarSpot(
  h: Herramientas,
  spot: { clave: string; formato: string },
  reglas: Reglas,
  prohibidas: string[],
): Promise<Resultado> {
  const dir = await mkdtemp(join(tmpdir(), 'spot-'));
  try {
    const original = join(dir, `original.${spot.formato}`);
    await writeFile(original, await h.almacen.leer(spot.clave));
    let duracionMs: number;
    try {
      duracionMs = await (h.medir ?? medirDuracionMs)(original);
    } catch {
      return {
        estado: 'rechazado',
        motivo: 'No pudimos leer el archivo. Revisa que sea un MP4, MP3 o WAV que se reproduzca bien.',
        duracionMs: null,
        transcripcion: null,
        coincidencias: [],
      };
    }
    // Si ya se pasa de la duración no hace falta transcribir: se rechaza con el dato exacto.
    if (duracionMs > reglas.duracionMaximaSegundos * 1000 + MARGEN_MS || !h.transcriptor) {
      return { ...decidir(reglas, duracionMs, null), duracionMs, transcripcion: null, coincidencias: [] };
    }
    const wav = join(dir, 'audio.wav');
    let segmentos;
    try {
      await (h.extraer ?? extraerAudio)(original, wav);
      segmentos = await h.transcriptor.transcribir(wav);
    } catch {
      return { ...decidir(reglas, duracionMs, null), duracionMs, transcripcion: null, coincidencias: [] };
    }
    const coincidencias = buscarPalabras(segmentos, prohibidas);
    const transcripcion = segmentos.map((s) => s.texto.trim()).filter(Boolean).join(' ');
    return { ...decidir(reglas, duracionMs, coincidencias), duracionMs, transcripcion, coincidencias };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
