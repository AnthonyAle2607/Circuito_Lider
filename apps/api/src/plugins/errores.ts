import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';

/** Error con estado HTTP y un mensaje que SÍ se puede mostrar al usuario. Todo lo demás sale como 500 genérico. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    readonly mensaje: string,
  ) {
    super(mensaje);
  }
}

export const noAutorizado = () => new HttpError(401, 'no_autorizado', 'Inicia sesión para continuar.');

/** Valida la entrada con su contrato; si no cumple, 400 con el primer problema. */
export function validar<T>(esquema: ZodType<T>, valor: unknown): T {
  const r = esquema.safeParse(valor);
  if (!r.success) {
    const p = r.error.issues[0]!;
    throw new HttpError(400, 'datos_invalidos', `${p.path.join('.') || 'datos'}: ${p.message}`);
  }
  return r.data;
}

export function manejarErrores(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: err.codigo, mensaje: err.mensaje });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) {
      return reply.code(429).send({ error: 'demasiadas_peticiones', mensaje: 'Demasiados intentos. Espera un momento.' });
    }
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'peticion_invalida', mensaje: 'La petición no es válida.' });
    }
    req.log.error({ err }, 'error no controlado');
    return reply.code(500).send({ error: 'error_interno', mensaje: 'Algo salió mal. Intenta de nuevo.' });
  });
}
