import Anthropic from '@anthropic-ai/sdk';

/**
 * Un cliente del SDK con un `fetch` falso que responde, petición a petición, con flujos SSE como los de la API real.
 * Así las pruebas corren el SDK y el bucle de verdad, sin red ni clave. Guarda cada cuerpo enviado para revisarlo.
 */
export type Bloque = { texto: string } | { herramienta: string; entrada: unknown };

export interface Respuesta {
  bloques: Bloque[];
  stop?: 'end_turn' | 'tool_use' | 'refusal' | 'max_tokens';
  uso?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

function sse(r: Respuesta, n: number): string {
  const ev = (tipo: string, datos: unknown) => `event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...(datos as object) })}\n\n`;
  const uso = r.uso ?? { input_tokens: 1000, output_tokens: 100 };
  let s = ev('message_start', {
    message: { id: `msg_${n}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: uso.input_tokens, output_tokens: 1, cache_read_input_tokens: uso.cache_read_input_tokens ?? 0, cache_creation_input_tokens: uso.cache_creation_input_tokens ?? 0 } },
  });
  r.bloques.forEach((b, i) => {
    if ('texto' in b) {
      s += ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } });
      s += ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: b.texto } });
    } else {
      s += ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `toolu_${n}_${i}`, name: b.herramienta, input: {} } });
      s += ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.entrada) } });
    }
    s += ev('content_block_stop', { index: i });
  });
  const stop = r.stop ?? (r.bloques.some((b) => 'herramienta' in b) ? 'tool_use' : 'end_turn');
  s += ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: uso.output_tokens } });
  s += ev('message_stop', {});
  return s;
}

export function simulador(guion: Respuesta[]) {
  const enviados: Array<Record<string, unknown>> = [];
  let n = 0;
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    enviados.push(JSON.parse(String(init?.body ?? '{}')));
    const r = guion[n];
    if (!r) throw new Error(`el guion no tiene la petición ${n + 1}`);
    return new Response(sse(r, n++), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': `req_${n}` } });
  };
  const cliente = new Anthropic({ apiKey: 'clave-de-prueba', fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
  // El guion es mutable: una prueba puede añadir respuestas después de crear el cliente.
  return { cliente, enviados, guion };
}
