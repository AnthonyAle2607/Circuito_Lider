import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDePrueba } from '@sp/db/testing';
import { verificarFirma } from '@sp/payments';
import { AVISOS, despacharAvisos, destinoDelEntorno } from '../src/avisos';

const SECRETO = 'secreto-de-avisos-para-n8n-0123456789abcdef';
const destino = { url: 'https://n8n.prueba/webhook/avisos', secreto: SECRETO };
const b = await baseDePrueba();
afterAll(() => b.cerrar());

/** Corre algo como dueño de la base (sembrar y mirar) y vuelve al rol de los trabajadores. */
const dueño = async <T>(sql: string, p: unknown[] = []) => {
  await b.comoDueno();
  try {
    return (await b.pg.query<T>(sql, p)).rows;
  } finally {
    await b.comoWorker();
  }
};
const worker = { query: (s: string, p?: unknown[]) => b.pg.query<Record<string, unknown>>(s, p) };
const nuevo = async (tipo: string, datos: Record<string, unknown>, anunciante: string | null = null) =>
  Number((await dueño<{ id: number }>(`INSERT INTO outbox (anunciante_id, tipo, datos) VALUES ($1, $2, $3) RETURNING id`, [anunciante, tipo, JSON.stringify(datos)]))[0]!.id);

let anunciante = '';
beforeAll(async () => {
  await b.comoWorker();
  [{ id: anunciante } = { id: '' }] = await dueño<{ id: string }>(`INSERT INTO anunciantes (empresa, pais) VALUES ('Café Andino', 'US') RETURNING id`);
  await dueño(`INSERT INTO usuarios (anunciante_id, email, nombre, password_hash) VALUES ($1, 'ana@cafe.com', 'Ana', 'x')`, [anunciante]);
});

describe('despachar avisos a n8n', () => {
  it('entrega cada evento firmado, con el contacto del anunciante, y lo marca despachado', async () => {
    const id = await nuevo('pedido.pagado', { pedido_id: 'p1' }, anunciante);
    const enviados: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const n = await despacharAvisos(worker, destino, async (url, init) => {
      enviados.push({ url, headers: init.headers, body: init.body });
      return { ok: true, status: 200 };
    });
    expect(n).toBe(1);
    const e = enviados[0]!;
    expect(e.url).toBe(destino.url);
    expect(() => verificarFirma(e.headers[AVISOS.cabeceraFirma], e.body, SECRETO)).not.toThrow();
    expect(JSON.parse(e.body)).toMatchObject({ id, tipo: 'pedido.pagado', datos: { pedido_id: 'p1' }, contacto: { email: 'ana@cafe.com', nombre: 'Ana', empresa: 'Café Andino' } });
    const [f] = await dueño<{ despachado_at: Date | null }>(`SELECT despachado_at FROM outbox WHERE id = $1`, [id]);
    expect(f!.despachado_at).not.toBeNull();
  });

  it('si n8n falla, cuenta el intento, guarda el error y espera antes de reintentar', async () => {
    const id = await nuevo('cuenta.registrada', { email: 'x@y.com' });
    expect(await despacharAvisos(worker, destino, async () => ({ ok: false, status: 502 }))).toBe(0);
    const [f] = await dueño<{ intentos: number; ultimo_error: string; espera: boolean }>(
      `SELECT intentos, ultimo_error, proximo_intento_at > now() AS espera FROM outbox WHERE id = $1`,
      [id],
    );
    expect(f).toMatchObject({ intentos: 1, ultimo_error: 'HTTP 502', espera: true });
    // Todavía en espera: la siguiente pasada no lo toma.
    let llamadas = 0;
    await despacharAvisos(worker, destino, async () => (llamadas++, { ok: true, status: 200 }));
    expect(llamadas).toBe(0);
  });

  it('un error de red también se reintenta, y a los 10 intentos el aviso queda parado', async () => {
    const id = await nuevo('pago.tardio', {});
    await despacharAvisos(worker, destino, async () => {
      throw new Error('ECONNREFUSED');
    });
    expect((await dueño<{ ultimo_error: string }>(`SELECT ultimo_error FROM outbox WHERE id = $1`, [id]))[0]!.ultimo_error).toBe('ECONNREFUSED');
    await dueño(`UPDATE outbox SET intentos = 10, proximo_intento_at = now() - interval '1 minute' WHERE id = $1`, [id]);
    let llamadas = 0;
    await despacharAvisos(worker, destino, async () => (llamadas++, { ok: true, status: 200 }));
    expect(llamadas).toBe(0);
  });

  it('el préstamo evita que dos trabajadores tomen el mismo aviso', async () => {
    const id = await nuevo('pedido.vencido', {});
    const primero = await worker.query('SELECT * FROM tomar_avisos(10)');
    const segundo = await worker.query('SELECT * FROM tomar_avisos(10)');
    expect(primero.rows.map((r) => Number(r.id))).toContain(id);
    expect(segundo.rows.map((r) => Number(r.id))).not.toContain(id);
  });
});

describe('destino', () => {
  it('sin URL no hay destino; con URL exige un secreto largo', () => {
    expect(destinoDelEntorno({})).toBeNull();
    expect(() => destinoDelEntorno({ AVISOS_URL: 'https://n8n/x', AVISOS_SECRETO: 'corto' })).toThrow('AVISOS_SECRETO');
    expect(destinoDelEntorno({ AVISOS_URL: 'https://n8n/x', AVISOS_SECRETO: SECRETO })).toEqual({ url: 'https://n8n/x', secreto: SECRETO });
  });
});
