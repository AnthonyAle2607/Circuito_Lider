import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4100';

/**
 * El token de la API vive solo del lado del servidor del panel, en una cookie HttpOnly que el navegador no puede leer.
 * El reto del doble factor también (dura 5 minutos).
 */
export const COOKIE_SESION = 'sp_equipo';
export const COOKIE_RETO = 'sp_reto';

export const opcionesCookie = (maxAge: number) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge,
});

export async function token(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_SESION)?.value;
}

/** Llama a la API como el miembro del equipo. Sin sesión, o con una vencida, manda a ingresar. */
export async function apiEquipo(ruta: string, init: RequestInit = {}): Promise<Response> {
  const t = await token();
  if (!t) redirect('/ingresar');
  const r = await fetch(`${API_URL}${ruta}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers, authorization: `Bearer ${t}` },
  });
  if (r.status === 401) redirect('/ingresar?vencida=1');
  return r;
}
