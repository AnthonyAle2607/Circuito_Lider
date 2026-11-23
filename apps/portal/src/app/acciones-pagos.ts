'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SesionDePago } from '@sp/schemas';
import { API_URL, api, sesionActual } from '@/lib/sesion';

/**
 * Acciones de pago (PT-5), aparte de `acciones.ts` para que ningún archivo crezca de más. La API decide todo: aquí
 * solo se pide la sesión de la pasarela (y se lleva al cliente a su página) o se envía el comprobante.
 */
type ErrorApi = { mensaje?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const volver = (pedido: string, q: string) => `/cuenta/pedidos/${pedido}?${q}`;

/** «Pagar en línea»: abre la sesión en la pasarela y lleva al cliente a su página de pago. */
export async function pagarEnLinea(f: FormData) {
  const pedido = String(f.get('pedido') ?? '');
  if (!UUID.test(pedido)) redirect('/cuenta/pagos');
  const r = await api<SesionDePago & ErrorApi>(`/v1/pedidos/${pedido}/pagar`, { method: 'POST', conSesion: true });
  if (!r.ok) redirect(volver(pedido, `error=${encodeURIComponent(r.datos.mensaje ?? 'No pudimos abrir el pago. Intenta de nuevo.')}`));
  redirect(SesionDePago.parse(r.datos).url);
}

/** Transferencia: sube el comprobante con la referencia bancaria; finanzas lo revisa. */
export async function enviarComprobante(f: FormData) {
  const pedido = String(f.get('pedido') ?? '');
  if (!UUID.test(pedido)) redirect('/cuenta/pagos');
  const token = await sesionActual();
  if (!token) redirect(`/ingresar?siguiente=${encodeURIComponent(volver(pedido, ''))}`);
  const archivo = f.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) redirect(volver(pedido, `error=${encodeURIComponent('Adjunta el comprobante de la transferencia.')}`));
  const cuerpo = new FormData();
  cuerpo.set('referencia', String(f.get('referencia') ?? '').trim());
  cuerpo.set('archivo', archivo, archivo.name);
  const r = await fetch(`${API_URL}/v1/pedidos/${pedido}/comprobante`, {
    method: 'POST',
    body: cuerpo,
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => null)) as ErrorApi | null;
    redirect(volver(pedido, `error=${encodeURIComponent(e?.mensaje ?? 'No pudimos enviar el comprobante. Intenta de nuevo.')}`));
  }
  revalidatePath(`/cuenta/pedidos/${pedido}`);
  redirect(volver(pedido, 'pago=transferencia'));
}
