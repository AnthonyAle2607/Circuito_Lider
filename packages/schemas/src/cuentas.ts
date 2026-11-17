import { z } from 'zod';

const Email = z.string().trim().toLowerCase().email().max(254);
/** Al entrar solo se limita el largo; la política completa se aplica al crear la clave. */
const ClaveDeIngreso = z.string().min(1).max(128);

// ── anunciante ──────────────────────────────────────────────────────────────
export const Registro = z.object({
  empresa: z.string().trim().min(1).max(200),
  pais: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Código de país de dos letras (ISO 3166)'),
  zonaHoraria: z.string().trim().min(1).max(64).optional(),
  nombre: z.string().trim().min(1).max(200),
  email: Email,
  password: z.string().min(12, 'La clave debe tener al menos 12 caracteres.').max(128),
});
export type Registro = z.infer<typeof Registro>;

export const VerificarCorreo = z.object({ codigo: z.string().min(20).max(100) });

export const Ingreso = z.object({ email: Email, password: ClaveDeIngreso });

export const SesionAbierta = z.object({
  token: z.string(),
  expiraAt: z.string(),
});
export type SesionAbierta = z.infer<typeof SesionAbierta>;

export const Yo = z.object({
  usuario: z.object({ id: z.string(), nombre: z.string(), email: z.string(), correoVerificado: z.boolean() }),
  anunciante: z.object({ id: z.string(), empresa: z.string(), pais: z.string(), zonaHoraria: z.string() }),
});
export type Yo = z.infer<typeof Yo>;

// ── equipo ──────────────────────────────────────────────────────────────────
export const RolEquipo = z.enum(['ventas', 'revisor', 'programacion', 'finanzas', 'gerencia', 'admin']);

export const IngresoEquipo = z.object({ email: Email, password: ClaveDeIngreso });
export const RetoEquipo = z.object({ reto: z.string() });
export const CodigoEquipo = z.object({ reto: z.string().min(20).max(100), codigo: z.string().regex(/^\d{6}$/) });

export const YoEquipo = z.object({ id: z.string(), nombre: z.string(), email: z.string(), roles: z.array(RolEquipo) });
export type YoEquipo = z.infer<typeof YoEquipo>;

export const ErrorApi = z.object({ error: z.string(), mensaje: z.string() });
export type ErrorApi = z.infer<typeof ErrorApi>;
