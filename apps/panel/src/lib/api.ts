import 'server-only';
import { Preparado } from '@sp/schemas';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4100';

/** Pregunta a la API si ella, la base y las colas responden. Nunca lanza: si no hay respuesta, devuelve null. */
export async function estadoDelServidor(): Promise<Preparado | null> {
  try {
    const r = await fetch(`${API_URL}/v1/ready`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return Preparado.parse(await r.json());
  } catch {
    return null;
  }
}
