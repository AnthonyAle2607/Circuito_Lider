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

const Opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((s) => (s ? s : null));

/** Datos de la empresa que el anunciante corrige desde su panel. Los campos vacíos se guardan como «sin dato». */
export const DatosEmpresa = z.object({
  empresa: z.string().trim().min(1, 'Escribe el nombre de la empresa.').max(200),
  pais: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Código de país de dos letras (ISO 3166)'),
  zonaHoraria: z.string().trim().min(1).max(64),
  idFiscal: Opcional(60),
  sector: Opcional(100),
  sitioWeb: Opcional(200),
  telefono: Opcional(40),
  direccion: Opcional(300),
});
export type DatosEmpresa = z.infer<typeof DatosEmpresa>;

export const DatosPerfil = z.object({ nombre: z.string().trim().min(1, 'Escribe tu nombre.').max(200) });

export const CambioClave = z.object({
  actual: ClaveDeIngreso,
  nueva: z.string().min(12, 'La clave debe tener al menos 12 caracteres.').max(128),
});

export const Yo = z.object({
  usuario: z.object({ id: z.string(), nombre: z.string(), email: z.string(), correoVerificado: z.boolean() }),
  /** Los datos de empresa admiten faltar (respuesta de una API anterior): el panel nunca debe caerse por eso. */
  anunciante: z.object({
    id: z.string(),
    empresa: z.string(),
    pais: z.string(),
    zonaHoraria: z.string(),
    idFiscal: z.string().nullable().default(null),
    sector: z.string().nullable().default(null),
    sitioWeb: z.string().nullable().default(null),
    telefono: z.string().nullable().default(null),
    direccion: z.string().nullable().default(null),
  }),
});
export type Yo = z.infer<typeof Yo>;

/** Lo que muestra el inicio del panel: campañas en curso, lo pendiente de pago y las próximas emisiones. */
export const ResumenPanel = z.object({
  campanasActivas: z.number().int(),
  emisionesPorSonar: z.number().int(),
  porPagar: z.object({ pedidos: z.number().int(), totalCentimos: z.number().int(), moneda: z.string().nullable(), venceAt: z.string().nullable() }),
  proximas: z.array(
    z.object({
      pedidoId: z.string(),
      fecha: z.string(),
      inicio: z.string(),
      fin: z.string(),
      programa: z.string(),
      donde: z.string(),
      estado: z.enum(['retenida', 'confirmada']),
    }),
  ),
});
export type ResumenPanel = z.infer<typeof ResumenPanel>;

// ── equipo ──────────────────────────────────────────────────────────────────
export const RolEquipo = z.enum(['ventas', 'revisor', 'programacion', 'finanzas', 'gerencia', 'admin']);

export const IngresoEquipo = z.object({ email: Email, password: ClaveDeIngreso });
export const RetoEquipo = z.object({ reto: z.string() });
export const CodigoEquipo = z.object({ reto: z.string().min(20).max(100), codigo: z.string().regex(/^\d{6}$/) });

export const YoEquipo = z.object({ id: z.string(), nombre: z.string(), email: z.string(), roles: z.array(RolEquipo) });
export type YoEquipo = z.infer<typeof YoEquipo>;

export const ErrorApi = z.object({ error: z.string(), mensaje: z.string() });
export type ErrorApi = z.infer<typeof ErrorApi>;
