import { firmar } from '@sp/payments';

/**
 * Despacho de avisos: lleva los eventos del outbox a n8n, que manda los correos y mensajes (decisión del vault: la
 * API registra el hecho, n8n avisa). Cada entrega va firmada (HMAC de `t.cuerpo`, cabecera `x-pautas-firma`) para que
 * n8n descarte lo que no venga de aquí. Sin AVISOS_URL no se despacha nada: los eventos esperan en el outbox.
 */
export const AVISOS = {
  trabajo: 'despachar-avisos',
  cadaMs: 15_000,
  porPasada: 25,
  cabeceraFirma: 'x-pautas-firma',
} as const;

type Consulta = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };
type Envio = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

export interface DestinoAvisos {
  url: string;
  secreto: string;
}

/** Lee el destino del entorno. Sin URL devuelve null (desarrollo); con URL exige un secreto decente. */
export function destinoDelEntorno(env: NodeJS.ProcessEnv): DestinoAvisos | null {
  if (!env.AVISOS_URL) return null;
  if (!env.AVISOS_SECRETO || env.AVISOS_SECRETO.length < 32) throw new Error('AVISOS_URL necesita AVISOS_SECRETO (32 caracteres o más).');
  return { url: env.AVISOS_URL, secreto: env.AVISOS_SECRETO };
}

/** Una pasada: toma hasta `porPasada` avisos, los entrega y marca cada resultado. Devuelve cuántos se entregaron. */
export async function despacharAvisos(
  db: Consulta,
  destino: DestinoAvisos,
  enviar: Envio = fetch as unknown as Envio,
  log: (msg: string, extra?: Record<string, unknown>) => void = () => {},
): Promise<number> {
  const { rows } = await db.query('SELECT * FROM tomar_avisos($1)', [AVISOS.porPasada]);
  let entregados = 0;
  for (const a of rows) {
    const cuerpo = JSON.stringify({
      id: Number(a.id),
      tipo: a.tipo,
      anuncianteId: a.anunciante_id ?? null,
      contacto: a.contacto ?? null,
      datos: a.datos,
      creadoAt: new Date(a.creado_at as string).toISOString(),
    });
    let error: string | null = null;
    try {
      const r = await enviar(destino.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [AVISOS.cabeceraFirma]: firmar(cuerpo, destino.secreto), 'x-pautas-evento': String(a.tipo) },
        body: cuerpo,
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) error = `HTTP ${r.status}`;
    } catch (e) {
      error = (e as Error).message || 'sin respuesta';
    }
    await db.query('SELECT resolver_aviso($1, $2)', [a.id, error]);
    if (error) log('aviso no entregado', { aviso: a.id, tipo: a.tipo, intento: Number(a.intentos) + 1, error });
    else entregados++;
  }
  return entregados;
}
