import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { withSistema, withTenant, type Database } from '@sp/db';
import { DecisionPago, type DatosTransferencia, type Pago, type TransferenciaPorRevisar } from '@sp/schemas';
import type { Almacen } from '@sp/spots';
import { contexto, exigirAnunciante, exigirEquipo } from '../../auth/sesiones';
import { HttpError, validar } from '../../plugins/errores';
import { UUID, aPago, pedidoNoExiste, pedidoPorPagar } from './comun';

/** Tipos de comprobante aceptados, reconocidos por sus primeros bytes (no por la extensión que dice el archivo). */
const TIPOS = [
  { ext: 'pdf', mime: 'application/pdf', firma: [0x25, 0x50, 0x44, 0x46] },
  { ext: 'png', mime: 'image/png', firma: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg', mime: 'image/jpeg', firma: [0xff, 0xd8, 0xff] },
] as const;
const tipoDe = (b: Buffer) => TIPOS.find((t) => t.firma.every((x, i) => b[i] === x));

export interface OpcionesTransferencia {
  db: Kysely<Database>;
  almacen: Almacen;
  datos: DatosTransferencia;
  maximoBytes: number;
}

/**
 * Pago por transferencia: el cliente ve los datos bancarios y sube el comprobante; finanzas lo revisa en el panel.
 * Mientras el comprobante espera revisión, el pedido no vence (liberar_reservas_vencidas lo respeta).
 */
export function rutaTransferencia(app: FastifyInstance, op: OpcionesTransferencia): void {
  const { db, almacen } = op;
  const anunciante = { preHandler: exigirAnunciante(db) };
  const finanzas = { preHandler: exigirEquipo(db, ['finanzas', 'gerencia']) };
  const quien = (req: { principal?: unknown }) => req.principal as { anuncianteId: string; usuarioId: string };

  app.get('/v1/pagos/transferencia', anunciante, async (): Promise<DatosTransferencia> => op.datos);

  app.post<{ Params: { id: string } }>('/v1/pedidos/:id/comprobante', anunciante, async (req, reply): Promise<Pago> => {
    const p = quien(req);
    if (!UUID.test(req.params.id)) throw pedidoNoExiste();
    if (!req.isMultipart()) throw new HttpError(400, 'sin_archivo', 'Adjunta el comprobante de la transferencia.');
    let referencia = '';
    let archivo: { nombre: string; datos: Buffer } | null = null;
    for await (const parte of req.parts({ limits: { fileSize: op.maximoBytes, files: 1, fields: 4 } })) {
      if (parte.type === 'field' && parte.fieldname === 'referencia') referencia = String(parte.value ?? '').trim();
      if (parte.type === 'file') {
        const datos = await parte.toBuffer();
        if (parte.file.truncated) throw new HttpError(413, 'archivo_grande', `El comprobante pesa más de ${Math.round(op.maximoBytes / 1048576)} MB.`);
        archivo = { nombre: parte.filename, datos };
      }
    }
    if (referencia.length < 3 || referencia.length > 100) throw new HttpError(400, 'referencia', 'Escribe el número de referencia de la transferencia.');
    if (!archivo || archivo.datos.length === 0) throw new HttpError(400, 'sin_archivo', 'Adjunta el comprobante de la transferencia.');
    const tipo = tipoDe(archivo.datos);
    if (!tipo) throw new HttpError(400, 'formato', 'Sube el comprobante en PDF, PNG o JPG.');

    const id = randomUUID();
    const clave = `comprobantes/${p.anuncianteId}/${id}.${tipo.ext}`;
    const nombre = archivo.nombre.replace(/[\\/]/g, '_').slice(0, 200);
    const pago = await withTenant(db, p.anuncianteId, async (t) => {
      const ped = await pedidoPorPagar(t, req.params.id);
      // El archivo se guarda dentro de la transacción ya validada: si el pedido no admite pago, no queda basura.
      await almacen.guardar(clave, archivo!.datos, tipo.mime);
      const f = await t
        .insertInto('pagos')
        .values({ id, anunciante_id: p.anuncianteId, pedido_id: ped.id, usuario_id: p.usuarioId, metodo: 'transferencia', proveedor: 'transferencia', referencia_externa: referencia, monto_centimos: ped.total_centimos, moneda: ped.moneda, url_pago: null, vence_at: null, comprobante_clave: clave, comprobante_nombre: nombre })
        .returningAll()
        .executeTakeFirstOrThrow();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'pago.comprobante_enviado',
        entidad: 'pago',
        entidadId: id,
        datos: { pedido_id: ped.id, referencia, monto_centimos: ped.total_centimos },
        ip: contexto(req).ip,
      });
      await t.insertInto('outbox').values({ anunciante_id: p.anuncianteId, tipo: 'pago.comprobante', datos: JSON.stringify({ pago_id: id, pedido_id: ped.id }) }).execute();
      return f;
    });
    return reply.code(201).send(aPago(pago));
  });

  // ── finanzas ──────────────────────────────────────────────────────────────
  app.get('/v1/panel/pagos/transferencias', finanzas, async (): Promise<TransferenciaPorRevisar[]> => {
    const r = await sql<Record<string, unknown>>`select * from transferencias_por_revisar()`.execute(db);
    return r.rows.map((f) => ({
      id: f.id as string,
      pedidoId: f.pedido_id as string,
      empresa: f.empresa as string,
      montoCentimos: Number(f.monto_centimos),
      moneda: f.moneda as string,
      referencia: (f.referencia_externa as string | null) ?? null,
      comprobanteNombre: (f.comprobante_nombre as string | null) ?? null,
      creadoAt: new Date(f.creado_at as string).toISOString(),
      reservaVenceAt: new Date(f.reserva_vence_at as string).toISOString(),
    }));
  });

  app.get<{ Params: { id: string } }>('/v1/panel/pagos/:id/comprobante', finanzas, async (req, reply) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'pago_no_existe', 'No encontramos ese pago.');
    const r = await sql<{ comprobante_clave: string; comprobante_nombre: string }>`select * from comprobante_de_transferencia(${req.params.id}::uuid)`.execute(db);
    const f = r.rows[0];
    if (!f) throw new HttpError(404, 'pago_no_existe', 'No encontramos ese comprobante.');
    const tipo = TIPOS.find((t) => f.comprobante_clave.endsWith(`.${t.ext}`))!;
    return reply.header('content-type', tipo.mime).header('cache-control', 'private, no-store').header('content-disposition', 'inline').send(await almacen.leer(f.comprobante_clave));
  });

  app.post<{ Params: { id: string } }>('/v1/panel/pagos/:id/decision', finanzas, async (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'pago_no_existe', 'No encontramos ese pago.');
    const d = validar(DecisionPago, req.body);
    const equipoId = (req.principal as { equipoId?: string } | undefined)?.equipoId ?? null;
    const resultado = await withSistema(db, async (t) => {
      const r = await sql<{ r: string }>`select decidir_transferencia(${req.params.id}::uuid, ${d.decision === 'aprobar'}, ${d.motivo || null}, ${equipoId}::uuid) as r`.execute(t);
      return r.rows[0]!.r;
    });
    if (resultado === 'ya_decidido') throw new HttpError(409, 'ya_decidido', 'Esta transferencia ya fue revisada.');
    return { resultado };
  });
}
