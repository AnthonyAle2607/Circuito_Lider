import { API_URL, sesionActual } from '@/lib/sesion';

/**
 * Relevo del chat con Toño: el navegador habla con el portal y el portal con la API, sumando la sesión del anunciante
 * si la hay (la cookie HttpOnly nunca sale al navegador). La respuesta de la API es un flujo SSE y pasa tal cual.
 */
const MAXIMO = 8 * 1024;

export async function POST(req: Request) {
  const cuerpo = await req.text();
  if (cuerpo.length > MAXIMO) return Response.json({ error: 'mensaje_largo', mensaje: 'El mensaje es demasiado largo.' }, { status: 413 });
  const token = await sesionActual();
  const ip = req.headers.get('x-forwarded-for');
  let r: Response;
  try {
    r = await fetch(`${API_URL}/v1/agente/mensajes`, {
      method: 'POST',
      body: cuerpo,
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...(ip && { 'x-forwarded-for': ip }) },
    });
  } catch {
    return Response.json({ error: 'agente_apagado', mensaje: 'El asistente no está disponible en este momento.' }, { status: 503 });
  }
  return new Response(r.body, {
    status: r.status,
    headers: { 'content-type': r.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}
