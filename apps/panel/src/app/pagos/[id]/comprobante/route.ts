import { API_URL, token } from '@/lib/sesion';

/** El comprobante de una transferencia para que finanzas lo vea (la sesión del equipo vive en su cookie HttpOnly). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado', { status: 404 });
  const t = await token();
  if (!t) return new Response('Inicia sesión', { status: 401 });
  const r = await fetch(`${API_URL}/v1/panel/pagos/${id}/comprobante`, { headers: { authorization: `Bearer ${t}` }, cache: 'no-store' });
  if (!r.ok || !r.body) return new Response('No encontrado', { status: r.status === 401 || r.status === 403 ? r.status : 404 });
  return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'private, no-store' } });
}
