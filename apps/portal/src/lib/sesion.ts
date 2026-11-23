import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4100';

/** El token de la API vive solo del lado del servidor del portal, en una cookie HttpOnly que el navegador no puede leer. */
import { COOKIE_SESION } from './cookie-sesion';
export { COOKIE_SESION };

export const opcionesCookie = (maxAge: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge,
});

export async function sesionActual(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_SESION)?.value;
}

export interface Respuesta<T> {
  ok: boolean;
  status: number;
  datos: T;
}

/** Llama a la API desde el servidor del portal. Con `conSesion`, usa el token del anunciante. Nunca lanza por estado HTTP. */
export async function api<T = unknown>(ruta: string, init: RequestInit & { conSesion?: boolean } = {}): Promise<Respuesta<T>> {
  const { conSesion, ...resto } = init;
  const token = conSesion ? await sesionActual() : undefined;
  const r = await fetch(`${API_URL}${ruta}`, {
    ...resto,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    headers: {
      ...(resto.body ? { 'content-type': 'application/json' } : {}),
      ...resto.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const texto = await r.text();
  return { ok: r.ok, status: r.status, datos: (texto ? JSON.parse(texto) : null) as T };
}

/** Exige sesión: sin ella (o vencida), manda a ingresar y vuelve después a `siguiente`. */
export async function exigirSesion(siguiente: string): Promise<string> {
  const t = await sesionActual();
  if (!t) redirect(`/ingresar?siguiente=${encodeURIComponent(siguiente)}`);
  return t;
}
