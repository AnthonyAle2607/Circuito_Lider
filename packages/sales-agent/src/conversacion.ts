import Anthropic from '@anthropic-ai/sdk';
import { costoMicroUsd, sumarUso, usoVacio, type Uso } from './costo';
import type { Dominio } from './dominio';
import { DEFINICIONES, ejecutar, type Efectos } from './herramientas';
import { INSTRUCCIONES } from './instrucciones';

/**
 * Un turno del cliente: el bucle de mensajes con herramientas (manual, no el Tool Runner, para guardar cada mensaje
 * exactamente como se envió y recibió, transmitir el texto al chat y cortar por gasto). Claude Opus 5.5 con esfuerzo
 * bajo; las instrucciones y las herramientas son fijas y van cacheadas; si el modelo declina, el servidor reintenta
 * con su respaldo (`fallbacks: 'default'`) y, si todo declina, el cliente pasa a una persona.
 */
export const MODELO = 'claude-opus-5-5';
const BETAS: Anthropic.Beta.AnthropicBeta[] = ['server-side-fallback-2026-07-01'];

export type Evento =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'herramienta'; nombre: string; estado: 'inicio' | 'ok' | 'error' };

export type Final = 'respondido' | 'traspaso' | 'declinado' | 'tope' | 'error';

export interface Turno {
  /** Mensajes nuevos de este turno, para añadir tal cual al historial (append-only). */
  nuevos: Anthropic.Beta.BetaMessageParam[];
  uso: Uso;
  costoMicroUsd: number;
  final: Final;
}

export interface OpcionesTurno {
  cliente: Anthropic;
  dominio: Dominio;
  /** Historial guardado, exactamente como se envió y recibió (con bloques de pensamiento). */
  historial: Anthropic.Beta.BetaMessageParam[];
  texto: string;
  /** Contexto que cambia (fecha, si el cliente tiene cuenta): va como mensaje de sistema tras su mensaje. */
  contexto: string;
  efectos: Efectos;
  emitir: (e: Evento) => void;
  /** Tope de gasto de este turno, en millonésimas de dólar (P9). */
  topeMicroUsd: number;
  maxIteraciones?: number;
}

const DESPEDIDA_DECLINADO = 'Disculpa, eso no lo puedo atender por aquí. Le paso tu conversación al equipo de ventas para que te escriba.';
const DESPEDIDA_TOPE = 'Para seguir con tu pauta te va a escribir una persona del equipo de ventas, que puede ayudarte mejor con esto.';

export async function atender(op: OpcionesTurno): Promise<Turno> {
  const nuevos: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: [{ type: 'text', text: op.texto }] },
    { role: 'system', content: op.contexto },
  ];
  let uso = usoVacio();
  let reintentos = 0;
  const cerrar = (final: Final, texto?: string): Turno => {
    if (texto) op.emitir({ tipo: 'texto', texto });
    return { nuevos, uso, costoMicroUsd: costoMicroUsd(uso), final };
  };

  for (let i = 0; i < (op.maxIteraciones ?? 8); i++) {
    const stream = op.cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: INSTRUCCIONES, cache_control: { type: 'ephemeral' } }],
      tools: DEFINICIONES,
      // Caché automática del último bloque: cada turno reutiliza toda la conversación anterior.
      cache_control: { type: 'ephemeral' },
      messages: [...op.historial, ...nuevos],
    });
    stream.on('text', (t) => op.emitir({ tipo: 'texto', texto: t }));

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
      reintentos = 0;
    } catch (e) {
      // Errores de la API (límite, autenticación…) suben; un corte de conexión o una entrada ilegible se reintenta.
      if (e instanceof Anthropic.APIError || reintentos++ >= 2) throw e;
      continue;
    }
    uso = sumarUso(uso, msg.usage);

    if (msg.stop_reason === 'refusal') {
      op.efectos.traspaso ??= { motivo: 'El modelo declinó responder', resumen: op.texto.slice(0, 500) };
      return cerrar('declinado', DESPEDIDA_DECLINADO);
    }
    nuevos.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue;

    const usos = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (usos.length === 0) return cerrar(op.efectos.traspaso ? 'traspaso' : 'respondido');
    // Una entrada cortada por max_tokens puede parecer válida: no se ejecuta.
    if (msg.stop_reason === 'max_tokens') return cerrar('error', DESPEDIDA_TOPE);

    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of usos) {
      op.emitir({ tipo: 'herramienta', nombre: u.name, estado: 'inicio' });
      const r = await ejecutar(u.name, u.input, op.dominio, op.efectos);
      op.emitir({ tipo: 'herramienta', nombre: u.name, estado: r.error ? 'error' : 'ok' });
      resultados.push({ type: 'tool_result', tool_use_id: u.id, content: r.contenido, ...(r.error && { is_error: true }) });
    }
    // Todos los resultados en un solo mensaje (así el modelo sigue pidiendo herramientas en paralelo).
    nuevos.push({ role: 'user', content: resultados });

    if (costoMicroUsd(uso) > op.topeMicroUsd) {
      op.efectos.traspaso ??= { motivo: 'Tope de gasto del turno', resumen: op.texto.slice(0, 500) };
      return cerrar('tope', DESPEDIDA_TOPE);
    }
  }
  op.efectos.traspaso ??= { motivo: 'Demasiados pasos en un turno', resumen: op.texto.slice(0, 500) };
  return cerrar('tope', DESPEDIDA_TOPE);
}
