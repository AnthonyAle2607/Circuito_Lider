'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/sesion';

/** Acciones para recuperar la clave (aparte de `acciones.ts` para que ningún archivo crezca de más). */
type ErrorApi = { mensaje?: string };
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Pide el enlace: la API responde lo mismo exista o no el correo. */
export async function pedirRecuperacion(f: FormData) {
  const r = await api<ErrorApi>('/v1/cuentas/recuperar-clave', { method: 'POST', body: JSON.stringify({ email: texto(f, 'email') }) });
  if (!r.ok) redirect(`/recuperar?error=${encodeURIComponent(r.datos?.mensaje ?? 'Revisa el correo e intenta de nuevo.')}`);
  redirect('/recuperar?enviado=1');
}

/** Crea la clave nueva con el código del enlace. Las dos claves deben coincidir. */
export async function restablecerClave(f: FormData) {
  const codigo = texto(f, 'codigo');
  const password = String(f.get('password') ?? '');
  const volver = (error: string) => `/restablecer?codigo=${encodeURIComponent(codigo)}&error=${encodeURIComponent(error)}`;
  if (password !== String(f.get('confirmar') ?? '')) redirect(volver('Las dos claves no coinciden.'));
  const r = await api<ErrorApi>('/v1/cuentas/restablecer-clave', { method: 'POST', body: JSON.stringify({ codigo, password }) });
  if (!r.ok) redirect(volver(r.datos?.mensaje ?? 'No pudimos cambiar la clave.'));
  redirect('/ingresar?clave=nueva');
}
