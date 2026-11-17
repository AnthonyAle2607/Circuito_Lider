import 'server-only';
import type { Tarifario } from '@sp/pricing';
import { Emisora, Parrilla, Preparado } from '@sp/schemas';

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

export async function emisoras(): Promise<Emisora[]> {
  const r = await fetch(`${API_URL}/v1/emisoras`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`La API respondió ${r.status} al pedir las emisoras`);
  return Emisora.array().parse(await r.json());
}

/** El tarifario vigente con las duraciones que se pueden cotizar, o null si todavía no hay ninguno. */
export async function tarifario(): Promise<(Tarifario & { duraciones: number[] }) | null> {
  const r = await fetch(`${API_URL}/v1/tarifario`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`La API respondió ${r.status} al pedir el tarifario`);
  return r.json();
}

/** null si la emisora no existe. */
export async function parrilla(slug: string): Promise<Parrilla | null> {
  const r = await fetch(`${API_URL}/v1/parrilla?emisora=${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(5000),
  });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`La API respondió ${r.status} al pedir la parrilla`);
  return Parrilla.parse(await r.json());
}
