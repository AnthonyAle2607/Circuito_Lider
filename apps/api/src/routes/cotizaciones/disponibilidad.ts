import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { parrillaDeEmisora } from '@sp/catalogo';
import type { Database } from '@sp/db';
import { diaIso, segundosLibres, sumarDias } from '@sp/inventory';
import { ConsultaDisponibilidad, type Disponible } from '@sp/schemas';
import { HttpError, validar } from '../../plugins/errores';

/** GET /v1/disponibilidad: segundos libres de cada franja de una emisora, día por día. Público. */
export function rutaDisponibilidad(app: FastifyInstance, db: Kysely<Database>): void {
  app.get('/v1/disponibilidad', async (req): Promise<Disponible[]> => {
    const q = validar(ConsultaDisponibilidad, req.query);
    const p = await parrillaDeEmisora(db, q.emisora, { soloActivas: true });
    if (!p) throw new HttpError(404, 'emisora_no_existe', 'No encontramos esa emisora.');
    const fechas = Array.from({ length: q.dias }, (_, i) => sumarDias(q.desde, i));
    const casillas = p.programas.flatMap((pr) =>
      pr.franjas.flatMap((f) => fechas.filter((d) => diaIso(d) === f.dia).map((fecha) => ({ pr, f, fecha }))),
    );
    const libres = new Map(
      (await segundosLibres(db, casillas.map((c) => ({ franjaId: c.f.id, fecha: c.fecha })))).map((l) => [`${l.franjaId}|${l.fecha}`, l]),
    );
    return casillas
      .map(({ pr, f, fecha }) => {
        const l = libres.get(`${f.id}|${fecha}`);
        return {
          franjaId: f.id,
          fecha,
          programa: pr.nombre,
          alcance: pr.alcance,
          inicio: f.inicio,
          fin: f.fin,
          capacidad: l?.capacidad ?? f.segundosTanda,
          libres: l?.libres ?? f.segundosTanda,
          cupoConfirmado: f.cupoConfirmado,
        };
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio));
  });
}
