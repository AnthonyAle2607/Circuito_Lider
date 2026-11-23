'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL, COOKIE_RETO, COOKIE_SESION, apiEquipo, opcionesCookie, token } from '@/lib/sesion';

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const mensajeDe = async (r: Response) => {
  try {
    return String((await r.json()).mensaje ?? 'No se pudo completar.');
  } catch {
    return 'No se pudo completar.';
  }
};

/** Paso 1: correo y clave. Si están bien, guarda el reto y pide el código. */
export async function ingresar(f: FormData) {
  const r = await fetch(`${API_URL}/v1/panel/sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: texto(f, 'email'), password: String(f.get('password') ?? '') }),
    cache: 'no-store',
  });
  if (!r.ok) redirect(`/ingresar?error=${encodeURIComponent(await mensajeDe(r))}`);
  const { reto } = (await r.json()) as { reto: string };
  (await cookies()).set(COOKIE_RETO, reto, opcionesCookie(5 * 60));
  redirect('/ingresar?paso=codigo');
}

/** Paso 2: el código de la aplicación de autenticación. Si es válido, abre la sesión. */
export async function enviarCodigo(f: FormData) {
  const jar = await cookies();
  const reto = jar.get(COOKIE_RETO)?.value;
  if (!reto) redirect('/ingresar?error=' + encodeURIComponent('Vuelve a escribir tu correo y clave.'));
  const r = await fetch(`${API_URL}/v1/panel/sesion/codigo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reto, codigo: texto(f, 'codigo') }),
    cache: 'no-store',
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string; mensaje?: string };
    if (j.error === 'reto_vencido') jar.delete(COOKIE_RETO);
    redirect(`/ingresar?${j.error === 'reto_vencido' ? '' : 'paso=codigo&'}error=${encodeURIComponent(j.mensaje ?? 'No se pudo completar.')}`);
  }
  const { token: t } = (await r.json()) as { token: string };
  jar.delete(COOKIE_RETO);
  jar.set(COOKIE_SESION, t, opcionesCookie(12 * 60 * 60));
  redirect('/parrilla');
}

export async function salir() {
  if (await token()) await apiEquipo('/v1/panel/sesion/salir', { method: 'POST' }).catch(() => undefined);
  (await cookies()).delete(COOKIE_SESION);
  redirect('/ingresar');
}

/** Guarda los cambios de una franja. Solo envía lo que cambió. */
export async function editarFranja(f: FormData) {
  const id = texto(f, 'id');
  const emisora = texto(f, 'emisora');
  const cambios: Record<string, unknown> = {};
  const inicio = texto(f, 'inicio');
  const fin = texto(f, 'fin');
  const segundos = texto(f, 'segundosTanda');
  if (inicio && inicio !== texto(f, 'inicio_antes')) cambios.inicio = inicio;
  if (fin && fin !== texto(f, 'fin_antes')) cambios.fin = fin === '00:00' ? '24:00' : fin;
  if (segundos && Number(segundos) !== Number(texto(f, 'segundos_antes'))) cambios.segundosTanda = Number(segundos);
  const activa = f.get('activa') === 'on';
  if (activa !== (texto(f, 'activa_antes') === 'true')) cambios.activa = activa;
  const confirmado = f.get('cupoConfirmado') === 'on';
  if (confirmado !== (texto(f, 'confirmado_antes') === 'true')) cambios.cupoConfirmado = confirmado;

  const volver = `/parrilla?emisora=${encodeURIComponent(emisora)}`;
  if (Object.keys(cambios).length === 0) redirect(`${volver}&aviso=${encodeURIComponent('No había cambios que guardar.')}`);
  const r = await apiEquipo(`/v1/panel/franjas/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(cambios) });
  if (!r.ok) redirect(`${volver}&error=${encodeURIComponent(await mensajeDe(r))}`);
  revalidatePath('/parrilla');
  redirect(`${volver}&aviso=${encodeURIComponent('Franja guardada.')}#f-${id}`);
}

/** Revisión humana de un spot: aprobar, o rechazar con el motivo que leerá el cliente. */
export async function decidirAnuncio(f: FormData) {
  const id = texto(f, 'id');
  const decision = texto(f, 'decision') === 'aprobar' ? 'aprobar' : 'rechazar';
  const r = await apiEquipo(`/v1/panel/anuncios/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, motivo: texto(f, 'motivo') }),
  });
  if (!r.ok) redirect(`/anuncios?error=${encodeURIComponent(await mensajeDe(r))}`);
  revalidatePath('/anuncios');
  redirect(`/anuncios?aviso=${encodeURIComponent(decision === 'aprobar' ? 'Anuncio aprobado.' : 'Anuncio rechazado; el cliente ve el motivo.')}`);
}

/** Revisión de una transferencia por finanzas: aprobar confirma el pedido; rechazar pide el motivo que verá el cliente. */
export async function decidirPago(f: FormData) {
  const id = texto(f, 'id');
  const decision = texto(f, 'decision') === 'aprobar' ? 'aprobar' : 'rechazar';
  const r = await apiEquipo(`/v1/panel/pagos/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, motivo: texto(f, 'motivo') || undefined }),
  });
  if (!r.ok) redirect(`/pagos?error=${encodeURIComponent(await mensajeDe(r))}`);
  const { resultado } = (await r.json()) as { resultado: string };
  revalidatePath('/pagos');
  const aviso =
    resultado === 'confirmado'
      ? 'Pago aprobado: el pedido quedó pagado.'
      : resultado === 'tardio'
        ? 'Pago aprobado, pero el pedido ya no estaba activo: hay que devolver el dinero.'
        : 'Transferencia rechazada; el cliente ve el motivo.';
  redirect(`/pagos?aviso=${encodeURIComponent(aviso)}`);
}
