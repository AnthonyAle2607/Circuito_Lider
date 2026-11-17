import { z } from 'zod';

const Entorno = z.object({
  API_PORT: z.coerce.number().int().positive().default(4100),
  API_HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MFA_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'debe ser 32 bytes en base64'),
  PORTAL_URL: z.string().url().default('http://localhost:3100'),
  AVISOS_EN_CONSOLA: z.enum(['0', '1']).default('0'),
  TRUST_PROXY: z.enum(['0', '1']).default('0'),
  LIMITE_GENERAL: z.coerce.number().int().positive().default(300),
  LIMITE_ACCESO: z.coerce.number().int().positive().default(10),
  LIMITE_COTIZAR: z.coerce.number().int().positive().default(30),
  TERMINOS_VERSION: z.string().min(1).max(60).default('2026-11-borrador'),
});

export type Config = {
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  mfaKey: Buffer;
  portalUrl: string;
  avisosEnConsola: boolean;
  trustProxy: boolean;
  limites: { general: number; acceso: number; cotizar: number };
  terminosVersion: string;
};

/** Lee y valida el entorno. Si falta algo, se detiene con un mensaje claro en vez de arrancar a medias. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Entorno.safeParse(env);
  if (!r.success) {
    const faltan = r.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuración incompleta (${faltan}). Copia .env.example a .env.`);
  }
  const e = r.data;
  if (e.AVISOS_EN_CONSOLA === '1' && env.NODE_ENV === 'production') {
    throw new Error('AVISOS_EN_CONSOLA=1 es solo para desarrollo: escribiría enlaces de verificación en los registros.');
  }
  return {
    port: e.API_PORT,
    host: e.API_HOST,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    mfaKey: Buffer.from(e.MFA_KEY, 'base64'),
    portalUrl: e.PORTAL_URL.replace(/\/$/, ''),
    avisosEnConsola: e.AVISOS_EN_CONSOLA === '1',
    trustProxy: e.TRUST_PROXY === '1',
    limites: { general: e.LIMITE_GENERAL, acceso: e.LIMITE_ACCESO, cotizar: e.LIMITE_COTIZAR },
    terminosVersion: e.TERMINOS_VERSION,
  };
}
