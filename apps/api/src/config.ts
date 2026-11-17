import { z } from 'zod';

const Entorno = z.object({
  API_PORT: z.coerce.number().int().positive().default(4100),
  API_HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});

export type Config = { port: number; host: string; databaseUrl: string; redisUrl: string };

/** Lee y valida el entorno. Si falta algo, se detiene con un mensaje claro en vez de arrancar a medias. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Entorno.safeParse(env);
  if (!r.success) {
    const faltan = r.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuración incompleta (${faltan}). Copia .env.example a .env.`);
  }
  return { port: r.data.API_PORT, host: r.data.API_HOST, databaseUrl: r.data.DATABASE_URL, redisUrl: r.data.REDIS_URL };
}
