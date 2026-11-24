import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { withSistema, withTenant, type Database } from '@sp/db';
import { DecisionAnuncio, type Anuncio, type AnuncioEnRevision } from '@sp/schemas';
import { formatoDe, type Almacen } from '@sp/spots';
import { contexto, exigirAnunciante, exigirEquipo } from '../auth/sesiones';
import { HttpError, validar } from '../plugins/errores';

/** Un spot de 40 s en MP4 de buena calidad no llega a 30 MB; el tope deja margen sin abrir la puerta a archivos enormes. */
export const MAXIMO_BYTES = 60 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = { mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4' } as const;


function aAnuncio(f: Record<string, unknown>): Anuncio {
  return {
    id: f.id as string,
    nombre: f.nombre as string,
    archivoNombre: f.archivo_nombre as string,
    formato: f.formato as Anuncio['formato'],
    bytes: f.bytes as number,
    duracionMs: (f.duracion_ms as number | null) ?? null,
    estado: f.estado as Anuncio['estado'],
    motivo: (f.motivo as string | null) ?? null,
    transcripcion: (f.transcripcion as string | null) ?? null,
    coincidencias: (f.coincidencias as Anuncio['coincidencias']) ?? [],
    creadoAt: (f.creado_at as Date).toISOString(),
    actualizadoAt: (f.actualizado_at as Date).toISOString(),
  };
}

const enviarArchivo = (reply: FastifyReply, datos: Buffer, formato: keyof typeof TIPOS) =>
  reply.header('content-type', TIPOS[formato]).header('cache-control', 'private, max-age=300').header('content-disposition', 'inline').send(datos);

/**
 * Anuncios (PT-6). El cliente sube su spot y ve en qué punto está la revisión; el equipo con rol de revisor decide lo
 * que la revisión automática no pudo dar por bueno. El archivo va al almacén configurado; la base guarda solo su clave.
 */
export async function rutasAnuncios(app: FastifyInstance, op: { db: Kysely<Database>; almacen: Almacen; formatos: string[] }): Promise<void> {
  const { db, almacen } = op;
  const anunciante = { preHandler: exigirAnunciante(db) };
  const revisor = { preHandler: exigirEquipo(db, ['revisor', 'gerencia']) };
  const quien = (req: { principal?: unknown }) => req.principal as { tipo: 'anunciante'; usuarioId: string; anuncianteId: string };

  // ── el cliente ─────────────────────────────────────────────────────────────
  app.post('/v1/anuncios', anunciante, async (req, reply) => {
    const p = quien(req);
    if (!req.isMultipart()) throw new HttpError(400, 'sin_archivo', 'Adjunta el archivo del anuncio.');
    let nombre = '';
    let archivo: { nombre: string; datos: Buffer } | null = null;
    for await (const parte of req.parts({ limits: { fileSize: MAXIMO_BYTES, files: 1, fields: 4 } })) {
      if (parte.type === 'field' && parte.fieldname === 'nombre') nombre = String(parte.value ?? '').trim();
      if (parte.type === 'file') {
        const datos = await parte.toBuffer();
        if (parte.file.truncated) throw new HttpError(413, 'archivo_grande', 'El archivo pesa más de 60 MB. Un spot de 40 s no necesita tanto.');
        archivo = { nombre: parte.filename, datos };
      }
    }
    if (!archivo || archivo.datos.length === 0) throw new HttpError(400, 'sin_archivo', 'Adjunta el archivo del anuncio.');
    const formato = formatoDe(archivo.nombre);
    if (!formato || !op.formatos.includes(formato)) throw new HttpError(400, 'formato', 'Sube el anuncio en MP4, MP3 o WAV.');
    const nombreFinal = (nombre || archivo.nombre.replace(/\.[^.]+$/, '')).slice(0, 120);
    const archivoNombre = archivo.nombre.replace(/[\\/]/g, '_').slice(0, 200);

    const id = randomUUID();
    const clave = `anuncios/${p.anuncianteId}/${id}.${formato}`;
    await almacen.guardar(clave, archivo.datos, TIPOS[formato]);
    const fila = await withTenant(db, p.anuncianteId, async (t) => {
      const f = await t
        .insertInto('anuncios')
        .values({ id, anunciante_id: p.anuncianteId, subido_por: p.usuarioId, nombre: nombreFinal, archivo_nombre: archivoNombre, archivo_clave: clave, formato, bytes: archivo!.datos.length, duracion_ms: null, motivo: null, transcripcion: null, tomado_at: null, revisado_por: null, revisado_at: null })
        .returningAll()
        .executeTakeFirstOrThrow();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'anuncio.subido',
        entidad: 'anuncio',
        entidadId: id,
        datos: { formato, bytes: archivo!.datos.length },
        ip: contexto(req).ip,
      });
      return f;
    });
    return reply.code(201).send(aAnuncio(fila));
  });

  app.get('/v1/anuncios', anunciante, async (req): Promise<Anuncio[]> => {
    const p = quien(req);
    const filas = await withTenant(db, p.anuncianteId, (t) => t.selectFrom('anuncios').selectAll().orderBy('creado_at', 'desc').limit(200).execute());
    return filas.map(aAnuncio);
  });

  app.get<{ Params: { id: string } }>('/v1/anuncios/:id', anunciante, async (req): Promise<Anuncio> => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'anuncio_no_existe', 'No encontramos ese anuncio.');
    const p = quien(req);
    const f = await withTenant(db, p.anuncianteId, (t) => t.selectFrom('anuncios').selectAll().where('id', '=', req.params.id).executeTakeFirst());
    if (!f) throw new HttpError(404, 'anuncio_no_existe', 'No encontramos ese anuncio.');
    return aAnuncio(f);
  });

  app.get<{ Params: { id: string } }>('/v1/anuncios/:id/archivo', anunciante, async (req, reply) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'anuncio_no_existe', 'No encontramos ese anuncio.');
    const p = quien(req);
    const f = await withTenant(db, p.anuncianteId, (t) =>
      t.selectFrom('anuncios').select(['archivo_clave', 'formato']).where('id', '=', req.params.id).executeTakeFirst(),
    );
    if (!f) throw new HttpError(404, 'anuncio_no_existe', 'No encontramos ese anuncio.');
    return enviarArchivo(reply, await almacen.leer(f.archivo_clave), f.formato);
  });

  // ── el equipo: revisión humana ──────────────────────────────────────────────
  app.get('/v1/panel/anuncios', revisor, async (): Promise<AnuncioEnRevision[]> => {
    const r = await sql<Record<string, unknown>>`select * from anuncios_en_revision()`.execute(db);
    return r.rows.map((f) => ({
      id: f.id as string,
      empresa: f.empresa as string,
      nombre: f.nombre as string,
      archivoNombre: f.archivo_nombre as string,
      formato: f.formato as AnuncioEnRevision['formato'],
      duracionMs: (f.duracion_ms as number | null) ?? null,
      motivo: (f.motivo as string | null) ?? null,
      transcripcion: (f.transcripcion as string | null) ?? null,
      coincidencias: (f.coincidencias as AnuncioEnRevision['coincidencias']) ?? [],
      creadoAt: new Date(f.creado_at as string).toISOString(),
    }));
  });

  app.get<{ Params: { id: string } }>('/v1/panel/anuncios/:id/archivo', revisor, async (req, reply) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'anuncio_no_existe', 'No encontramos ese anuncio.');
    const r = await sql<{ archivo_clave: string; formato: keyof typeof TIPOS }>`select * from archivo_de_anuncio_en_revision(${req.params.id}::uuid)`.execute(db);
    const f = r.rows[0];
    if (!f) throw new HttpError(404, 'anuncio_no_existe', 'Ese anuncio ya no espera revisión.');
    return enviarArchivo(reply, await almacen.leer(f.archivo_clave), f.formato);
  });

  app.post<{ Params: { id: string } }>('/v1/panel/anuncios/:id/decision', revisor, async (req, reply) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'anuncio_no_existe', 'No encontramos ese anuncio.');
    const d = validar(DecisionAnuncio, req.body);
    const equipoId = (req.principal as { equipoId?: string } | undefined)?.equipoId ?? null;
    await withSistema(db, async (t) => {
      const r = await sql<{ anunciante: string | null }>`select decidir_anuncio(${req.params.id}::uuid, ${d.decision === 'aprobar'}, ${d.motivo || null}, ${equipoId}::uuid) as anunciante`.execute(t);
      const anuncianteId = r.rows[0]?.anunciante;
      if (!anuncianteId) throw new HttpError(409, 'ya_decidido', 'Este anuncio ya no espera revisión.');
      await registrar(t, {
        anuncianteId,
        actor: { tipo: 'equipo', id: equipoId ?? undefined },
        accion: d.decision === 'aprobar' ? 'anuncio.aprobado' : 'anuncio.rechazado',
        entidad: 'anuncio',
        entidadId: req.params.id,
        datos: d.motivo ? { motivo: d.motivo } : {},
        ip: contexto(req).ip,
      });
    });
    return reply.code(204).send();
  });
}

