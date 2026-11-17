'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_SESION, api, opcionesCookie, sesionActual } from '@/lib/sesion';

type ErrorApi = { error?: string; mensaje?: string; faltantes?: Array<{ franjaId: string; fecha: string }> };
const COOKIE_VOLVER = 'sp_volver';
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
/** Solo se vuelve a rutas internas del portal (evita redirecciones abiertas). */
const interna = (s: string) => (s.startsWith('/') && !s.startsWith('//') ? s : '/cuenta');
const conError = (ruta: string, mensaje: string) => `${ruta}${ruta.includes('?') ? '&' : '?'}error=${encodeURIComponent(mensaje)}`;

// ── cotizar (lo llama el cotizador desde el navegador) ───────────────────────
export async function crearCotizacion(d: {
  duracionSegundos: number;
  emisiones: Array<{ franjaId: string; fecha: string }>;
}): Promise<{ ok: true; id: string } | { ok: false; mensaje: string; faltantes?: ErrorApi['faltantes'] }> {
  const r = await api<{ id: string } & ErrorApi>('/v1/cotizaciones', { method: 'POST', body: JSON.stringify(d) });
  if (r.ok) return { ok: true, id: r.datos.id };
  return { ok: false, mensaje: r.datos?.mensaje ?? 'No pudimos cotizar. Intenta de nuevo.', ...(r.datos?.faltantes && { faltantes: r.datos.faltantes }) };
}

// ── cuenta ───────────────────────────────────────────────────────────────────
export async function registrarse(f: FormData) {
  const siguiente = interna(texto(f, 'siguiente') || '/cuenta');
  const r = await api<ErrorApi>('/v1/cuentas/registro', {
    method: 'POST',
    body: JSON.stringify({
      empresa: texto(f, 'empresa'),
      pais: texto(f, 'pais'),
      nombre: texto(f, 'nombre'),
      email: texto(f, 'email'),
      password: String(f.get('password') ?? ''),
    }),
  });
  if (!r.ok) redirect(conError(`/registro?siguiente=${encodeURIComponent(siguiente)}`, r.datos?.mensaje ?? 'No pudimos crear la cuenta.'));
  // El enlace del correo no sabe de dónde venía la persona: se recuerda aquí para volver a su cotización al confirmar.
  (await cookies()).set(COOKIE_VOLVER, siguiente, opcionesCookie(2 * 24 * 60 * 60));
  redirect(`/registro/listo?email=${encodeURIComponent(texto(f, 'email'))}&siguiente=${encodeURIComponent(siguiente)}`);
}

/** El enlace del correo abre una página con un botón: así los lectores de correo que abren enlaces solos no gastan el código. */
export async function verificarCorreo(f: FormData) {
  const jar = await cookies();
  const siguiente = interna(texto(f, 'siguiente') || jar.get(COOKIE_VOLVER)?.value || '/cuenta');
  jar.delete(COOKIE_VOLVER);
  const r = await api<ErrorApi>('/v1/cuentas/verificar-correo', { method: 'POST', body: JSON.stringify({ codigo: texto(f, 'codigo') }) });
  if (!r.ok) redirect(conError('/verificar', r.datos?.mensaje ?? 'El enlace no es válido.'));
  redirect(`/ingresar?verificado=1&siguiente=${encodeURIComponent(siguiente)}`);
}

export async function ingresar(f: FormData) {
  const siguiente = interna(texto(f, 'siguiente') || '/cuenta');
  const r = await api<{ token: string } & ErrorApi>('/v1/cuentas/ingresar', {
    method: 'POST',
    body: JSON.stringify({ email: texto(f, 'email'), password: String(f.get('password') ?? '') }),
  });
  if (!r.ok) redirect(conError(`/ingresar?siguiente=${encodeURIComponent(siguiente)}`, r.datos?.mensaje ?? 'No pudimos iniciar la sesión.'));
  (await cookies()).set(COOKIE_SESION, r.datos.token, opcionesCookie(7 * 24 * 60 * 60));
  redirect(siguiente);
}

export async function salir() {
  if (await sesionActual()) await api('/v1/cuentas/salir', { method: 'POST', conSesion: true }).catch(() => undefined);
  (await cookies()).delete(COOKIE_SESION);
  redirect('/');
}

// ── reservar y cancelar ──────────────────────────────────────────────────────
export async function reservar(f: FormData) {
  const id = texto(f, 'cotizacion');
  const volver = `/cotizacion/${encodeURIComponent(id)}`;
  if (!(await sesionActual())) redirect(`/ingresar?siguiente=${encodeURIComponent(volver)}`);
  if (f.get('acepta') !== 'on') redirect(conError(volver, 'Para reservar tienes que aceptar los términos.'));
  const r = await api<{ id: string } & ErrorApi>(`/v1/cotizaciones/${encodeURIComponent(id)}/reservar`, {
    method: 'POST',
    conSesion: true,
    body: JSON.stringify({ aceptaTerminos: true, terminosVersion: texto(f, 'terminos') }),
  });
  if (r.status === 401) {
    (await cookies()).delete(COOKIE_SESION);
    redirect(`/ingresar?siguiente=${encodeURIComponent(volver)}`);
  }
  if (!r.ok) redirect(conError(volver, r.datos?.mensaje ?? 'No pudimos reservar.'));
  revalidatePath('/cuenta');
  redirect(`/cuenta/pedidos/${r.datos.id}?nuevo=1`);
}

export async function cancelarPedido(f: FormData) {
  const id = texto(f, 'pedido');
  const volver = `/cuenta/pedidos/${encodeURIComponent(id)}`;
  const r = await api<ErrorApi>(`/v1/pedidos/${encodeURIComponent(id)}/cancelar`, { method: 'POST', conSesion: true });
  if (r.status === 401) redirect(`/ingresar?siguiente=${encodeURIComponent(volver)}`);
  if (!r.ok) redirect(conError(volver, r.datos?.mensaje ?? 'No pudimos cancelar.'));
  revalidatePath('/cuenta');
  redirect(volver);
}
