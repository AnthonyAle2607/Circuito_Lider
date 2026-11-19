import { API_URL, sesionActual } from '@/lib/sesion';

/** El recorte de audio del certificado, para el reproductor del panel. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado', { status: 404 });
  const token = await sesionActual();
  if (!token) return new Response('Inicia sesión', { status: 401 });
  const r = await fetch(`${API_URL}/v1/certificados/${id}/audio`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!r.ok || !r.body) return new Response('No encontrado', { status: r.status === 401 ? 401 : 404 });
  return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=3600' } });
}
