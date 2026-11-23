import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Dominio } from './dominio';

/**
 * Herramientas del agente. Las definiciones (nombre, descripción, esquema) son fijas y siempre en el mismo orden, para
 * que la caché sirva. Los límites viven aquí, en código (D18), no en las instrucciones: un cliente puede convencer al
 * modelo de algo, pero no a estas guardas.
 */
export const LIMITES = {
  /** Emisiones por cotización. */
  maxEmisiones: 200,
  /** Cotizaciones por conversación. */
  maxCotizaciones: 8,
  /** Días que se pueden mirar en cupos de una vez. */
  maxDiasCupos: 14,
} as const;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESQUEMAS = {
  ver_emisoras: z.object({}).strict(),
  ver_tarifas: z.object({}).strict(),
  ver_parrilla: z.object({ emisora: z.string().min(2).max(40) }).strict(),
  consultar_cupos: z.object({ emisora: z.string().min(2).max(40), desde: z.string().regex(FECHA), dias: z.number().int().min(1).max(LIMITES.maxDiasCupos) }).strict(),
  cotizar: z
    .object({
      duracion_segundos: z.number().int().positive(),
      emisiones: z.array(z.object({ franja_id: z.string().min(1).max(60), fecha: z.string().regex(FECHA) }).strict()).min(1).max(LIMITES.maxEmisiones),
    })
    .strict(),
  guardar_prospecto: z
    .object({
      nombre: z.string().max(120).optional(),
      empresa: z.string().max(160).optional(),
      correo: z.string().max(200).optional(),
      telefono: z.string().max(40).optional(),
      pais: z.string().max(60).optional(),
      presupuesto_usd: z.number().nonnegative().optional(),
      interes: z.string().max(500).optional(),
    })
    .strict(),
  pasar_a_persona: z.object({ motivo: z.string().min(3).max(300), resumen: z.string().min(3).max(1500) }).strict(),
} as const;

export type NombreHerramienta = keyof typeof ESQUEMAS;
export type Prospecto = z.infer<(typeof ESQUEMAS)['guardar_prospecto']>;

const obj = (props: Record<string, unknown>, requeridos: string[] = []) => ({ type: 'object' as const, properties: props, required: requeridos, additionalProperties: false });
const texto = (descripcion: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description: descripcion, ...extra });

/** Definiciones para la API, en orden fijo. `strict` asegura que la entrada respete el esquema. */
export const DEFINICIONES: Anthropic.Beta.BetaTool[] = [
  { name: 'ver_emisoras', description: 'Lista las diez emisoras de Circuito Líder con su ciudad, frecuencia y slug.', input_schema: obj({}) },
  {
    name: 'ver_tarifas',
    description: 'Precio por emisión según alcance (nacional o local) y duración del spot, descuentos por volumen y el monto desde el que ventas aprueba.',
    input_schema: obj({}),
  },
  {
    name: 'ver_parrilla',
    description: 'Programas de una emisora con sus franjas: id de franja, día (1 = lunes … 7 = domingo) y horario de Venezuela. Los programas en cadena aparecen en todas las emisoras con la misma franja.',
    input_schema: obj({ emisora: texto('Slug de la emisora, por ejemplo caracas') }, ['emisora']),
  },
  {
    name: 'consultar_cupos',
    description: `Segundos libres por franja y fecha en una emisora, desde una fecha y por hasta ${LIMITES.maxDiasCupos} días.`,
    input_schema: obj(
      { emisora: texto('Slug de la emisora'), desde: texto('Primera fecha, AAAA-MM-DD (desde mañana)'), dias: { type: 'integer', description: `Cuántos días mirar (1 a ${LIMITES.maxDiasCupos})` } },
      ['emisora', 'desde', 'dias'],
    ),
  },
  {
    name: 'cotizar',
    description: 'Crea una cotización con el tarifario vigente y devuelve el total, su vencimiento y el enlace donde el cliente la reserva y paga. Cada emisión es una franja en una fecha que corresponda a su día.',
    input_schema: obj(
      {
        duracion_segundos: { type: 'integer', description: 'Duración del spot: 30 o 40' },
        emisiones: { type: 'array', description: `Hasta ${LIMITES.maxEmisiones} emisiones`, items: obj({ franja_id: texto('Id de la franja'), fecha: texto('AAAA-MM-DD') }, ['franja_id', 'fecha']) },
      },
      ['duracion_segundos', 'emisiones'],
    ),
  },
  {
    name: 'guardar_prospecto',
    description: 'Guarda los datos de contacto y el interés del cliente para el seguimiento de ventas. Llama solo con lo que el cliente dijo.',
    input_schema: obj({
      nombre: texto('Nombre de la persona'),
      empresa: texto('Empresa o marca'),
      correo: texto('Correo'),
      telefono: texto('Teléfono o WhatsApp'),
      pais: texto('País'),
      presupuesto_usd: { type: 'number', description: 'Presupuesto aproximado en USD' },
      interes: texto('Qué quiere anunciar y dónde'),
    }),
  },
  {
    name: 'pasar_a_persona',
    description: 'Pasa la conversación al equipo de ventas. Después de usarla no sigas vendiendo: despídete.',
    input_schema: obj({ motivo: texto('Por qué pasa a una persona'), resumen: texto('Qué quiere el cliente y qué se le ofreció') }, ['motivo', 'resumen']),
  },
].map((h) => ({ ...h, strict: true, eager_input_streaming: true }));

/** Lo que una conversación va acumulando y que la API guarda: prospecto, cotizaciones creadas y el traspaso. */
export interface Efectos {
  prospecto: Prospecto;
  cotizaciones: string[];
  traspaso: { motivo: string; resumen: string } | null;
}

type Resultado = { contenido: string; error: boolean };
const json = (x: unknown) => JSON.stringify(x);
const bien = (x: unknown): Resultado => ({ contenido: json(x), error: false });
const mal = (x: unknown): Resultado => ({ contenido: json(x), error: true });

/** Cada herramienta con su entrada ya validada por su esquema. */
type Manejadores = { [N in NombreHerramienta]: (d: z.infer<(typeof ESQUEMAS)[N]>, dominio: Dominio, efectos: Efectos) => Promise<Resultado> };

const MANEJADORES: Manejadores = {
  ver_emisoras: async (_d, dominio) => bien(await dominio.emisoras()),
  ver_tarifas: async (_d, dominio) => bien((await dominio.tarifas()) ?? { error: 'sin_tarifario' }),
  ver_parrilla: async (d, dominio) => {
    const p = await dominio.parrilla(d.emisora);
    return p ? bien(p) : mal({ error: 'emisora_no_existe' });
  },
  consultar_cupos: async (d, dominio) => {
    const c = await dominio.cupos(d.emisora, d.desde, d.dias);
    return c ? bien(c) : mal({ error: 'emisora_no_existe' });
  },
  cotizar: async (d, dominio, efectos) => {
    if (efectos.cotizaciones.length >= LIMITES.maxCotizaciones) {
      return mal({ error: 'tope_de_cotizaciones', mensaje: 'Ya se hicieron demasiadas cotizaciones en esta conversación: pasa a una persona.' });
    }
    const c = await dominio.cotizar({ duracionSegundos: d.duracion_segundos, emisiones: d.emisiones.map((x) => ({ franjaId: x.franja_id, fecha: x.fecha })) });
    if (c.ok) efectos.cotizaciones.push(c.id);
    return c.ok ? bien(c) : mal(c);
  },
  guardar_prospecto: async (d, _dominio, efectos) => {
    Object.assign(efectos.prospecto, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
    return bien({ guardado: true });
  },
  pasar_a_persona: async (d, _dominio, efectos) => {
    efectos.traspaso = { motivo: d.motivo, resumen: d.resumen };
    return bien({ traspasado: true, nota: 'Ventas verá esta conversación. Despídete sin seguir vendiendo.' });
  },
};

/**
 * Ejecuta una herramienta. La entrada se valida antes con su esquema (con entrada transmitida en vivo, el SDK puede
 * entregar un objeto truncado): si no pasa, vuelve como error para que el modelo la corrija.
 */
export async function ejecutar(nombre: string, entrada: unknown, dominio: Dominio, efectos: Efectos): Promise<Resultado> {
  if (!(nombre in ESQUEMAS)) return mal({ error: 'herramienta_desconocida' });
  const n = nombre as NombreHerramienta;
  const r = ESQUEMAS[n].safeParse(entrada);
  if (!r.success) return mal({ error: 'entrada_invalida', detalle: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  return (MANEJADORES[n] as (d: unknown, dom: Dominio, ef: Efectos) => Promise<Resultado>)(r.data, dominio, efectos);
}
