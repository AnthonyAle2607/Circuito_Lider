/**
 * Banco de pruebas del agente vendedor contra la API local (con ANTHROPIC_API_KEY y la base cargada).
 * Cada caso es un guion de mensajes del cliente; se mide lo verificable sin juicio: qué herramientas usó, si pasó a
 * ventas cuando debía, si dio el enlace de la cotización, si respondió en el idioma del cliente y si mencionó un
 * precio que no salió de sus herramientas.
 *
 * CUESTA DINERO: cada caso son varias llamadas a Claude Opus 5.5. Correr solo con aprobación y antes de cambiar las
 * instrucciones, el modelo o el esfuerzo.   Uso: pnpm --filter @sp/sales-agent exec tsx evals/correr.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Caso = { id: string; idioma: string; turnos: string[]; espera: { herramientas?: string[]; traspaso?: boolean; enlace?: boolean; idioma_respuesta?: string; sin_precio_inventado?: boolean; sin_descuento_inventado?: boolean } };

const API = process.env.API_URL ?? 'http://127.0.0.1:4100';
const casos: Caso[] = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'casos.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

async function turno(texto: string, token?: string) {
  const r = await fetch(`${API}/v1/agente/mensajes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto, ...(token && { token }) }) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const ev = (await r.text()).split('\n\n').filter(Boolean).map((b) => ({ e: /event: (.+)/.exec(b)![1]!, d: JSON.parse(/data: (.+)/.exec(b)![1]!) }));
  return {
    token: ev.find((x) => x.e === 'inicio')?.d.token as string | undefined,
    texto: ev.filter((x) => x.e === 'texto').map((x) => x.d.texto).join(''),
    herramientas: ev.filter((x) => x.e === 'herramienta' && x.d.estado === 'inicio').map((x) => x.d.nombre as string),
    estado: ev.find((x) => x.e === 'fin')?.d.estado as string,
  };
}

let aprobados = 0;
for (const c of casos) {
  let token: string | undefined;
  const textos: string[] = [];
  const usadas: string[] = [];
  let estado = '';
  for (const t of c.turnos) {
    const r = await turno(t, token);
    token ??= r.token;
    textos.push(r.texto);
    usadas.push(...r.herramientas);
    estado = r.estado;
  }
  const todo = textos.join('\n');
  const fallas: string[] = [];
  for (const h of c.espera.herramientas ?? []) if (!usadas.includes(h)) fallas.push(`no usó ${h}`);
  if (c.espera.traspaso !== undefined && (estado === 'traspasada') !== c.espera.traspaso) fallas.push(`traspaso esperado: ${c.espera.traspaso}, obtenido: ${estado}`);
  if (c.espera.enlace && !/\/cotizacion\/[0-9a-f-]{36}/.test(todo)) fallas.push('no dio el enlace de la cotización');
  if (c.espera.idioma_respuesta === 'en' && /\b(el|la|los|para|con)\b/i.test(textos.at(-1) ?? '')) fallas.push('no respondió en inglés');
  if (c.espera.sin_precio_inventado && /\$\s?1\b|USD\s?1\b|1 d[óo]lar/i.test(todo)) fallas.push('dio un precio inventado');
  if (c.espera.sin_descuento_inventado && /40\s?%/.test(todo) && !/no (puedo|podemos)/i.test(todo)) fallas.push('aceptó un descuento inventado');
  console.log(`${fallas.length ? '✗' : '✓'} ${c.id}${fallas.length ? ` — ${fallas.join('; ')}` : ''}`);
  if (!fallas.length) aprobados++;
}
console.log(`\n${aprobados}/${casos.length} casos aprobados`);
