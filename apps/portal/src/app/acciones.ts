'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL, COOKIE_SESION, api, opcionesCookie, sesionActual } from '@/lib/sesion';

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

// ── panel del anunciante ─────────────────────────────────────────────────────
const opcional = (f: FormData, k: string) => texto(f, k) || null;

export async function guardarEmpresa(f: FormData) {
  const r = await api<ErrorApi>('/v1/cuentas/empresa', {
    method: 'PUT',
    conSesion: true,
    body: JSON.stringify({
      empresa: texto(f, 'empresa'),
      pais: texto(f, 'pais'),
      zonaHoraria: texto(f, 'zonaHoraria'),
      idFiscal: opcional(f, 'idFiscal'),
      sector: opcional(f, 'sector'),
      sitioWeb: opcional(f, 'sitioWeb'),
      telefono: opcional(f, 'telefono'),
      direccion: opcional(f, 'direccion'),
    }),
  });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/empresa');
  if (!r.ok) redirect(conError('/cuenta/empresa', r.datos?.mensaje ?? 'No pudimos guardar los datos.'));
  revalidatePath('/cuenta', 'layout');
  redirect('/cuenta/empresa?ok=1');
}

export async function guardarPerfil(f: FormData) {
  const r = await api<ErrorApi>('/v1/cuentas/perfil', { method: 'PUT', conSesion: true, body: JSON.stringify({ nombre: texto(f, 'nombre') }) });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/seguridad');
  if (!r.ok) redirect(conError('/cuenta/seguridad', r.datos?.mensaje ?? 'No pudimos guardar tu nombre.'));
  revalidatePath('/cuenta', 'layout');
  redirect('/cuenta/seguridad?ok=perfil');
}

export async function cambiarClave(f: FormData) {
  const nueva = String(f.get('nueva') ?? '');
  if (nueva !== String(f.get('repetir') ?? '')) redirect(conError('/cuenta/seguridad', 'La clave nueva y su repetición no coinciden.'));
  const r = await api<ErrorApi>('/v1/cuentas/clave', {
    method: 'POST',
    conSesion: true,
    body: JSON.stringify({ actual: String(f.get('actual') ?? ''), nueva }),
  });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/seguridad');
  if (!r.ok) redirect(conError('/cuenta/seguridad', r.datos?.mensaje ?? 'No pudimos cambiar la clave.'));
  redirect('/cuenta/seguridad?ok=clave');
}

// ── anuncios ─────────────────────────────────────────────────────────────────
/** Sube el spot a la API con la sesión del anunciante. Devuelve un mensaje para el formulario. */
export async function subirAnuncio(f: FormData): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const token = await sesionActual();
  if (!token) return { ok: false, mensaje: 'Tu sesión venció. Vuelve a ingresar.' };
  const archivo = f.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: 'Elige el archivo de tu anuncio.' };
  const cuerpo = new FormData();
  cuerpo.set('nombre', texto(f, 'nombre'));
  cuerpo.set('archivo', archivo, archivo.name);
  const r = await fetch(`${API_URL}/v1/anuncios`, {
    method: 'POST',
    body: cuerpo,
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => null)) as ErrorApi | null;
    return { ok: false, mensaje: e?.mensaje ?? 'No pudimos subir el anuncio. Intenta de nuevo.' };
  }
  revalidatePath('/cuenta/anuncios');
  return { ok: true };
}

/** Elige qué anuncio suena en un pedido (solo anuncios aprobados). */
export async function asignarAnuncio(f: FormData) {
  const pedido = texto(f, 'pedido');
  const r = await api<ErrorApi>(`/v1/pedidos/${encodeURIComponent(pedido)}/anuncio`, {
    method: 'PUT',
    conSesion: true,
    body: JSON.stringify({ anuncioId: texto(f, 'anuncio') }),
  });
  const ruta = `/cuenta/pedidos/${pedido}`;
  if (r.status === 401) redirect(`/ingresar?siguiente=${encodeURIComponent(ruta)}`);
  if (!r.ok) redirect(conError(ruta, r.datos?.mensaje ?? 'No pudimos asignar el anuncio.'));
  revalidatePath(ruta);
  redirect(`${ruta}?anuncio=1`);
}
