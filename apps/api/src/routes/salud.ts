import type { FastifyInstance } from 'fastify';
import type { Preparado, Salud } from '@sp/schemas';

/** Una comprobación por dependencia: resuelve si está en pie, lanza si no. */
export type Comprobaciones = Record<string, () => Promise<void>>;

const VERSION = process.env.npm_package_version ?? '0.1.0';
const ESPERA_MS = 2000;

function conLimite(p: Promise<void>): Promise<void> {
  let t: NodeJS.Timeout | undefined;
  const limite = new Promise<void>((_, rej) => {
    t = setTimeout(() => rej(new Error('tiempo agotado')), ESPERA_MS);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

export async function rutasSalud(app: FastifyInstance, comprobaciones: Comprobaciones): Promise<void> {
  // El vigilante externo pregunta aquí cada minuto: solo dice que el proceso responde.
  app.get('/v1/health', async (): Promise<Salud> => ({ ok: true, servicio: 'api', version: VERSION }));

  // Preparado = además la base y las colas responden. 503 si alguna falla, sin detalles internos.
  app.get('/v1/ready', async (_req, reply): Promise<Preparado> => {
    const nombres = Object.keys(comprobaciones);
    const resultados = await Promise.allSettled(nombres.map((n) => conLimite(comprobaciones[n]!())));
    const dependencias = Object.fromEntries(
      nombres.map((n, i) => [n, resultados[i]!.status === 'fulfilled' ? ('ok' as const) : ('caida' as const)]),
    );
    const ok = Object.values(dependencias).every((e) => e === 'ok');
    if (!ok) reply.code(503);
    return { ok, dependencias };
  });
}
