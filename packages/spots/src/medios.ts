import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { Segmento } from './reglas';

const ejecutar = promisify(execFile);
const LIMITE_MS = 120_000;

/** Duración exacta del archivo en milisegundos, con ffprobe. Lanza si el archivo no es audio o video legible. */
export async function medirDuracionMs(archivo: string, ffprobe = process.env.FFPROBE_BIN ?? 'ffprobe'): Promise<number> {
  const { stdout } = await ejecutar(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', archivo], {
    timeout: LIMITE_MS,
  });
  const s = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(s) || s <= 0) throw new Error('No se pudo leer la duración del archivo.');
  return Math.round(s * 1000);
}

/** Extrae el audio a WAV mono de 16 kHz, el formato que espera Whisper. Sirve igual para MP4, MP3 y WAV. */
export async function extraerAudio(entrada: string, salida: string, ffmpeg = process.env.FFMPEG_BIN ?? 'ffmpeg'): Promise<void> {
  await ejecutar(ffmpeg, ['-v', 'error', '-y', '-i', entrada, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', salida], { timeout: LIMITE_MS });
}

/** Convierte a transcripción con tiempos. null = no hay transcriptor instalado. */
export interface Transcriptor {
  nombre: string;
  transcribir(wav: string): Promise<Segmento[]>;
}

/**
 * whisper.cpp (whisper-cli), local y sin costo por uso: no es un agente de IA ni envía el audio a terceros.
 * `-oj` escribe `<salida>.json` con cada tramo y sus tiempos en milisegundos.
 */
export function whisperCpp(bin: string, modelo: string, idioma = 'es'): Transcriptor {
  return {
    nombre: 'whisper.cpp',
    async transcribir(wav) {
      const base = wav.replace(/\.wav$/i, '');
      await ejecutar(bin, ['-m', modelo, '-f', wav, '-l', idioma, '-oj', '-of', base, '-np'], { timeout: 5 * 60_000 });
      const j = JSON.parse(await readFile(`${base}.json`, 'utf8')) as {
        transcription?: Array<{ offsets?: { from: number; to: number }; text?: string }>;
      };
      return (j.transcription ?? []).map((t) => ({ inicio: (t.offsets?.from ?? 0) / 1000, fin: (t.offsets?.to ?? 0) / 1000, texto: t.text ?? '' }));
    },
  };
}

/** El transcriptor configurado por entorno (WHISPER_BIN y WHISPER_MODEL), o null si no está instalado. */
export function transcriptorDelEntorno(env: NodeJS.ProcessEnv = process.env): Transcriptor | null {
  return env.WHISPER_BIN && env.WHISPER_MODEL ? whisperCpp(env.WHISPER_BIN, env.WHISPER_MODEL, env.WHISPER_IDIOMA ?? 'es') : null;
}
