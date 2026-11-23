import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@sp/db';
import { AvisoInvalido, type Aviso, type Pasarela } from '@sp/payments';
import { HttpError } from '../../plugins/errores';

/**
 * Lleva un aviso verificado (o el resultado de una conciliación) a la base. `resolver_pago` guarda el evento con su id
 * único antes de tocar nada: si llega dos veces, la segunda devuelve «duplicado» y no cambia nada (P5).
 */
export async function aplicarAviso(db: Kysely<Database>, proveedor: string, a: Aviso, cuerpo: unknown): Promise<string> {
  const r = await sql<{ r: string }>`select resolver_pago(${proveedor}, ${a.eventoId}, ${a.tipo}, ${a.referencia}, ${a.estado}::estado_pago,
    ${a.montoCentimos}, ${a.moneda}, ${JSON.stringify(cuerpo)}::jsonb) as r`.execute(db);
  return r.rows[0]!.r;
}

/**
 * POST /v1/pagos/webhook/:proveedor: avisos de la pasarela. Se lee el cuerpo crudo (la firma es sobre los bytes
 * exactos), se verifica y solo entonces se aplica. Responde 200 aunque el aviso sea repetido o desconocido, para que
 * la pasarela no lo reintente sin fin; responde 400 si la firma no es válida.
 */
export async function rutaAviso(app: FastifyInstance, op: { db: Kysely<Database>; pasarela: Pasarela }): Promise<void> {
  await app.register(async (sub) => {
    sub.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 64 * 1024 }, (_req, cuerpo, listo) => listo(null, cuerpo));
    sub.post<{ Params: { proveedor: string } }>('/v1/pagos/webhook/:proveedor', { config: { rateLimit: false } }, async (req) => {
      if (req.params.proveedor !== op.pasarela.nombre) throw new HttpError(404, 'proveedor_desconocido', 'Proveedor de pago desconocido.');
      const crudo = typeof req.body === 'string' ? req.body : '';
      let aviso: Aviso;
      try {
        aviso = op.pasarela.verificarAviso(req.headers, crudo);
      } catch (e) {
        if (e instanceof AvisoInvalido) {
          req.log.warn({ motivo: e.message }, 'aviso de pago rechazado');
          throw new HttpError(400, 'aviso_invalido', 'Aviso no válido.');
        }
        throw e;
      }
      const resultado = await aplicarAviso(op.db, op.pasarela.nombre, aviso, JSON.parse(crudo));
      req.log.info({ evento: aviso.eventoId, referencia: aviso.referencia, resultado }, 'aviso de pago');
      return { recibido: true, resultado };
    });
  });
}
