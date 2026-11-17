import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { registrar } from '@sp/audit';
import { parrillaDeEmisora } from '@sp/catalogo';
import type { Database } from '@sp/db';
import { ConsultaParrilla, EditarFranja, type Franja, type Parrilla } from '@sp/schemas';
import { exigirEquipo } from '../../auth/sesiones';
import { HttpError, validar } from '../../plugins/errores';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** Programación y gerencia corrigen la parrilla: horarios, segundos de tanda y qué franjas se venden. */
export async function rutasPanelCatalogo(app: FastifyInstance, db: Kysely<Database>): Promise<void> {
  const acceso = { preHandler: exigirEquipo(db, ['programacion', 'gerencia']) };

  // A diferencia del portal, el panel ve también las franjas que no se venden.
  app.get('/v1/panel/franjas', acceso, async (req): Promise<Parrilla> => {
    const { emisora } = validar(ConsultaParrilla, req.query);
    const p = await parrillaDeEmisora(db, emisora);
    if (!p) throw new HttpError(404, 'emisora_no_existe', 'No encontramos esa emisora.');
    return p;
  });

  app.put<{ Params: { id: string } }>('/v1/panel/franjas/:id', acceso, async (req): Promise<Franja> => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'franja_no_existe', 'No encontramos esa franja.');
    const c = validar(EditarFranja, req.body);
    const p = req.principal!;

    return db.transaction().execute(async (t) => {
      const antes = await t
        .selectFrom('franjas')
        .select([
          'id',
          'dia_semana',
          sql<string>`hora_inicio::text`.as('inicio'),
          sql<string>`hora_fin::text`.as('fin'),
          'segundos_tanda',
          'activa',
          'cupo_confirmado',
        ])
        .where('id', '=', req.params.id)
        .forUpdate()
        .executeTakeFirst();
      if (!antes) throw new HttpError(404, 'franja_no_existe', 'No encontramos esa franja.');

      const inicio = c.inicio ?? antes.inicio.slice(0, 5);
      const fin = c.fin ?? antes.fin.slice(0, 5);
      if (minutos(fin) <= minutos(inicio)) {
        throw new HttpError(400, 'horario_invalido', 'La franja debe terminar después de empezar. Si cruza la medianoche, pártela en dos.');
      }

      const despues = await t
        .updateTable('franjas')
        .set({
          ...(c.inicio && { hora_inicio: c.inicio }),
          ...(c.fin && { hora_fin: c.fin }),
          ...(c.segundosTanda !== undefined && { segundos_tanda: c.segundosTanda }),
          ...(c.activa !== undefined && { activa: c.activa }),
          ...(c.cupoConfirmado !== undefined && { cupo_confirmado: c.cupoConfirmado }),
          actualizado_at: new Date(),
        })
        .where('id', '=', antes.id)
        .returning([
          'id',
          'dia_semana',
          sql<string>`hora_inicio::text`.as('inicio'),
          sql<string>`hora_fin::text`.as('fin'),
          'segundos_tanda',
          'activa',
          'cupo_confirmado',
        ])
        .executeTakeFirstOrThrow();

      await registrar(t, {
        actor: { tipo: 'equipo', id: p.tipo === 'equipo' ? p.equipoId : undefined },
        accion: 'franja.editada',
        entidad: 'franja',
        entidadId: antes.id,
        datos: { antes, cambios: c },
        ip: req.ip,
      });

      return {
        id: despues.id,
        dia: despues.dia_semana,
        inicio: despues.inicio.slice(0, 5),
        fin: despues.fin.slice(0, 5),
        segundosTanda: despues.segundos_tanda,
        activa: despues.activa,
        cupoConfirmado: despues.cupo_confirmado,
      };
    });
  });
}
