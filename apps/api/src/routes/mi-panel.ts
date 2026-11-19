import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { withTenant, type Database } from '@sp/db';
import { hoyEnCaracas } from '@sp/inventory';
import { CambioClave, DatosEmpresa, DatosPerfil, type ResumenPanel } from '@sp/schemas';
import { hashPassword, passwordPolicyError, verifyPassword } from '../auth/password';
import { contexto, exigirAnunciante } from '../auth/sesiones';
import { HttpError, validar } from '../plugins/errores';

/**
 * El panel del anunciante: el resumen de su inicio, los datos de su empresa, su nombre y su clave. Todo corre con
 * `withTenant`, así que la RLS impide tocar otra cuenta aunque el código se equivocara de id.
 */
export async function rutasMiPanel(app: FastifyInstance, db: Kysely<Database>, op: { limiteAcceso: number }): Promise<void> {
  const acceso = { preHandler: exigirAnunciante(db) };
  const quien = (req: { principal?: unknown }) => {
    const p = req.principal as { tipo: string; sesionId: string; usuarioId: string; anuncianteId: string } | undefined;
    if (p?.tipo !== 'anunciante') throw new HttpError(401, 'no_autorizado', 'Inicia sesión para continuar.');
    return p;
  };

  app.get('/v1/cuentas/resumen', acceso, async (req): Promise<ResumenPanel> => {
    const p = quien(req);
    const hoy = hoyEnCaracas();
    return withTenant(db, p.anuncianteId, async (t) => {
      const porSonar = t
        .selectFrom('reservas as r')
        .innerJoin('pedidos as pe', 'pe.id', 'r.pedido_id')
        .where('r.estado', '!=', 'liberada')
        .where('pe.estado', 'in', ['reservado', 'pagado'])
        .where('r.fecha', '>=', hoy);

      const conteo = await porSonar
        .select((eb) => [eb.fn.count<number>('r.id').as('emisiones'), eb.fn.count<number>('pe.id').distinct().as('pedidos')])
        .executeTakeFirstOrThrow();

      const proximas = await porSonar
        .innerJoin('franjas as f', 'f.id', 'r.franja_id')
        .innerJoin('programas as pr', 'pr.id', 'f.programa_id')
        .leftJoin('emisoras as e', 'e.id', 'pr.emisora_id')
        .select(['r.pedido_id', 'r.fecha', 'r.estado', 'f.hora_inicio', 'f.hora_fin', 'pr.nombre', 'pr.alcance', 'e.ciudad'])
        .orderBy('r.fecha')
        .orderBy('f.hora_inicio')
        .limit(5)
        .execute();

      const pendientes = await t
        .selectFrom('pedidos')
        .where('estado', '=', 'reservado')
        .select((eb) => [
          eb.fn.count<number>('id').as('n'),
          eb.fn.coalesce(eb.fn.sum<number>('total_centimos'), eb.lit(0)).as('total'),
          eb.fn.min('moneda').as('moneda'),
          eb.fn.min('reserva_vence_at').as('vence'),
        ])
        .executeTakeFirstOrThrow();

      return {
        campanasActivas: Number(conteo.pedidos),
        emisionesPorSonar: Number(conteo.emisiones),
        porPagar: {
          pedidos: Number(pendientes.n),
          totalCentimos: Number(pendientes.total),
          moneda: pendientes.moneda ?? null,
          venceAt: pendientes.vence ? new Date(pendientes.vence as unknown as string).toISOString() : null,
        },
        proximas: proximas.map((r) => ({
          pedidoId: r.pedido_id,
          fecha: r.fecha,
          inicio: r.hora_inicio.slice(0, 5),
          fin: r.hora_fin.slice(0, 5),
          programa: r.nombre,
          donde: r.alcance === 'nacional' ? 'En cadena nacional' : (r.ciudad ?? ''),
          estado: r.estado === 'confirmada' ? 'confirmada' : 'retenida',
        })),
      };
    });
  });

  app.put('/v1/cuentas/empresa', acceso, async (req, reply) => {
    const p = quien(req);
    const d = validar(DatosEmpresa, req.body);
    await withTenant(db, p.anuncianteId, async (t) => {
      await t
        .updateTable('anunciantes')
        .set({
          empresa: d.empresa,
          pais: d.pais,
          zona_horaria: d.zonaHoraria,
          id_fiscal: d.idFiscal,
          sector: d.sector,
          sitio_web: d.sitioWeb,
          telefono: d.telefono,
          direccion: d.direccion,
          actualizado_at: new Date(),
        })
        .where('id', '=', p.anuncianteId)
        .execute();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'cuenta.empresa_actualizada',
        entidad: 'anunciante',
        entidadId: p.anuncianteId,
        datos: { pais: d.pais },
        ip: contexto(req).ip,
      });
    });
    return reply.code(204).send();
  });

  app.put('/v1/cuentas/perfil', acceso, async (req, reply) => {
    const p = quien(req);
    const d = validar(DatosPerfil, req.body);
    await withTenant(db, p.anuncianteId, async (t) => {
      await t.updateTable('usuarios').set({ nombre: d.nombre }).where('id', '=', p.usuarioId).execute();
      await registrar(t, {
        anuncianteId: p.anuncianteId,
        actor: { tipo: 'anunciante', id: p.usuarioId },
        accion: 'cuenta.perfil_actualizado',
        entidad: 'usuario',
        entidadId: p.usuarioId,
        ip: contexto(req).ip,
      });
    });
    return reply.code(204).send();
  });

  /** Cambia la clave pidiendo la actual. Cierra las demás sesiones abiertas de ese usuario; la actual sigue. */
  app.post(
    '/v1/cuentas/clave',
    { ...acceso, config: { rateLimit: { max: op.limiteAcceso, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const p = quien(req);
      const d = validar(CambioClave, req.body);
      const politica = passwordPolicyError(d.nueva);
      if (politica) throw new HttpError(400, 'clave_debil', politica);
      if (d.nueva === d.actual) throw new HttpError(400, 'clave_igual', 'La clave nueva debe ser distinta de la actual.');

      const fila = await withTenant(db, p.anuncianteId, (t) =>
        t.selectFrom('usuarios').select('password_hash').where('id', '=', p.usuarioId).executeTakeFirstOrThrow(),
      );
      if (!(await verifyPassword(fila.password_hash, d.actual))) throw new HttpError(400, 'clave_actual', 'La clave actual no es correcta.');
      const nuevoHash = await hashPassword(d.nueva);

      await withTenant(db, p.anuncianteId, async (t) => {
        const r = await sql<{ ok: boolean }>`select cambiar_clave_usuario(${p.usuarioId}::uuid, ${nuevoHash}) as ok`.execute(t);
        if (!r.rows[0]?.ok) throw new HttpError(404, 'no_encontrado', 'No encontramos tu usuario.');
        await t
          .updateTable('sesiones')
          .set({ revocada_at: new Date() })
          .where('usuario_id', '=', p.usuarioId)
          .where('id', '!=', p.sesionId)
          .where('revocada_at', 'is', null)
          .execute();
        await registrar(t, {
          anuncianteId: p.anuncianteId,
          actor: { tipo: 'anunciante', id: p.usuarioId },
          accion: 'cuenta.clave_cambiada',
          entidad: 'usuario',
          entidadId: p.usuarioId,
          ip: contexto(req).ip,
        });
      });
      return reply.code(204).send();
    },
  );
}
