/**
 * Conversación de Toño con el agente vendedor (PT-5b), a través de /api/agente (el portal relaya a la API). Lee el flujo
 * SSE y avisa cada fragmento de texto. Si el agente está apagado (sin credenciales), devuelve 'apagado' y el chat usa
 * sus respuestas fijas (tono-respuestas.ts). El token de la conversación vive en sessionStorage.
 */
const CLAVE = 'tono:conversacion';

export const QUE_HACE: Record<string, string> = {
  ver_emisoras: 'Toño está mirando las emisoras…',
  ver_tarifas: 'Toño está revisando las tarifas…',
  ver_parrilla: 'Toño está revisando la programación…',
  consultar_cupos: 'Toño está consultando los cupos…',
  cotizar: 'Toño está armando tu cotización…',
  guardar_prospecto: 'Toño está tomando nota…',
  pasar_a_persona: 'Toño está avisando al equipo de ventas…',
};

const leerToken = () => {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
};
const guardarToken = (t: string) => {
  try {
    sessionStorage.setItem(CLAVE, t);
  } catch {
    // Sin almacenamiento (ventana privada): la conversación dura lo que dure la página.
  }
};

export type Resultado = 'ok' | 'apagado' | 'error';

export async function conversar(
  texto: string,
  op: { alTexto: (t: string) => void; alHerramienta: (nombre: string) => void; alFin: (estado: string) => void },
): Promise<Resultado> {
  let r: Response;
  const token = leerToken();
  try {
    r = await fetch('/api/agente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto, ...(token && { token }) }) });
  } catch {
    return 'error';
  }
  if (r.status === 503) return 'apagado';
  if (r.status === 404) {
    // Con token: la conversación guardada ya no existe, se olvida y se empieza otra (una sola vez).
    // Sin token: la API no tiene el chat (versión vieja); se trata como apagado.
    if (!token) return 'apagado';
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {}
    return conversar(texto, op);
  }
  if (!r.ok || !r.body) return 'error';

  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += value;
    const bloques = pendiente.split('\n\n');
    pendiente = bloques.pop() ?? '';
    for (const b of bloques) {
      const evento = /^event: (.+)$/m.exec(b)?.[1];
      const datos = /^data: (.+)$/m.exec(b)?.[1];
      if (!evento || !datos) continue;
      const d = JSON.parse(datos) as { token?: string; texto?: string; nombre?: string; estado?: string };
      if (evento === 'inicio' && d.token) guardarToken(d.token);
      if (evento === 'texto' && d.texto) op.alTexto(d.texto);
      if (evento === 'herramienta' && d.nombre && d.estado === 'inicio') op.alHerramienta(d.nombre);
      if (evento === 'fin') op.alFin(d.estado ?? 'agente');
    }
  }
  return 'ok';
}

/**
 * Pinta el texto del agente de forma segura: es salida de un modelo, así que va como texto, nunca como HTML. Las
 * direcciones http(s) se vuelven enlaces.
 */
export function pintarTexto(destino: HTMLElement, texto: string): void {
  destino.textContent = '';
  const partes = texto.split(/(https?:\/\/[^\s)]+)/g);
  for (const p of partes) {
    if (/^https?:\/\//.test(p)) {
      const a = document.createElement('a');
      a.href = p;
      a.textContent = p.length > 48 ? `${p.slice(0, 45)}…` : p;
      a.rel = 'noopener';
      destino.appendChild(a);
    } else if (p) {
      destino.appendChild(document.createTextNode(p));
    }
  }
}
