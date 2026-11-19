import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { TASA } from './huella';

const ejecutar = promisify(execFile);
const ffmpeg = () => process.env.FFMPEG_BIN ?? 'ffmpeg';

/**
 * Lee un audio (cualquier formato que entienda ffmpeg) como muestras mono a 5.512 Hz, listas para la huella.
 * `desde` y `duracion` (segundos) recortan sin leer el resto del archivo.
 */
export function leerMuestras(archivo: string, op: { desde?: number; duracion?: number } = {}): Promise<Float32Array> {
  const args = ['-v', 'error'];
  if (op.desde) args.push('-ss', String(op.desde));
  args.push('-i', archivo);
  if (op.duracion) args.push('-t', String(op.duracion));
  args.push('-vn', '-ac', '1', '-ar', String(TASA), '-f', 'f32le', '-');
  return new Promise((ok, mal) => {
    const p = spawn(ffmpeg(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const partes: Buffer[] = [];
    let error = '';
    p.stdout.on('data', (d: Buffer) => partes.push(d));
    p.stderr.on('data', (d: Buffer) => (error += d.toString()));
    p.on('error', mal);
    p.on('close', (codigo) => {
      if (codigo !== 0) return mal(new Error(`ffmpeg no pudo leer ${archivo}: ${error.trim().slice(0, 300)}`));
      const b = Buffer.concat(partes);
      ok(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)).slice());
    });
  });
}

/**
 * Recorta el momento exacto de la emisión para el certificado: desde unos segundos antes hasta unos después, en MP3,
 * con el audio tal cual salió al aire (se recodifica solo para que cualquier navegador lo reproduzca).
 */
export async function recortar(archivo: string, desde: number, duracion: number, salida: string): Promise<void> {
  await ejecutar(
    ffmpeg(),
    ['-v', 'error', '-y', '-ss', String(Math.max(0, desde)), '-i', archivo, '-t', String(duracion), '-vn', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', salida],
    { timeout: 120_000 },
  );
}
