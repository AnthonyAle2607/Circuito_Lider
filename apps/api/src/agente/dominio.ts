import type { Kysely } from 'kysely';
import { listarEmisoras, parrillaDeEmisora, tarifarioVigente } from '@sp/catalogo';
import type { Database } from '@sp/db';
import { diaIso, segundosLibres, sumarDias } from '@sp/inventory';
import type { Dominio } from '@sp/sales-agent';
import { HttpError } from '../plugins/errores';
import { crearCotizacion } from '../routes/cotizaciones';
import { leerCotizacion } from '../routes/cotizaciones/lectura';

/**
 * El dominio que ve el agente, armado con las mismas funciones que usan las rutas del portal (P11). Cada cotización
 * queda ligada a su conversación (P12). Los errores de dominio vuelven como datos para que el agente los explique.
 */
export function dominioDelAgente(db: Kysely<Database>, op: { portalUrl: string; conversacionId: string; ip: string | null }): Dominio {
  return {
    async emisoras() {
      return (await listarEmisoras(db)).map((e) => ({ slug: e.slug, nombre: e.nombre, ciudad: e.ciudad, frecuencia: e.frecuencia }));
    },
    async parrilla(slug) {
      const p = await parrillaDeEmisora(db, slug, { soloActivas: true });
      return p ? p.programas.map((pr) => ({ nombre: pr.nombre, alcance: pr.alcance, descripcion: pr.descripcion, franjas: pr.franjas.map((f) => ({ id: f.id, dia: f.dia, inicio: f.inicio, fin: f.fin })) })) : null;
    },
    async tarifas() {
      const t = await tarifarioVigente(db);
      if (!t) return null;
      return {
        moneda: t.moneda,
        esEjemplo: t.esEjemplo,
        duraciones: [...new Set(t.tarifas.map((x) => x.duracionSegundos))].sort((a, b) => a - b),
        precios: t.tarifas.map((x) => ({ alcance: x.alcance, duracionSegundos: x.duracionSegundos, centimos: x.precioCentimos })),
        descuentos: t.descuentos.map((x) => ({ desdeEmisiones: x.minEmisiones, bps: x.descuentoBps })),
        umbralAprobacionCentimos: t.umbralAprobacionCentimos,
      };
    },
    async cupos(slug, desde, dias) {
      const p = await parrillaDeEmisora(db, slug, { soloActivas: true });
      if (!p) return null;
      const fechas = Array.from({ length: dias }, (_, i) => sumarDias(desde, i));
      const casillas = p.programas.flatMap((pr) => pr.franjas.flatMap((f) => fechas.filter((d) => diaIso(d) === f.dia).map((fecha) => ({ pr, f, fecha }))));
      const libres = new Map((await segundosLibres(db, casillas.map((c) => ({ franjaId: c.f.id, fecha: c.fecha })))).map((l) => [`${l.franjaId}|${l.fecha}`, l]));
      return casillas.map(({ pr, f, fecha }) => {
        const l = libres.get(`${f.id}|${fecha}`);
        return { franjaId: f.id, fecha, programa: pr.nombre, inicio: f.inicio, libres: l?.libres ?? f.segundosTanda, capacidad: l?.capacidad ?? f.segundosTanda };
      });
    },
    async cotizar(d) {
      try {
        const id = await crearCotizacion(db, d, { ip: op.ip, conversacionId: op.conversacionId });
        const c = (await leerCotizacion(db, id))!;
        return {
          ok: true,
          id,
          totalCentimos: c.totalCentimos,
          moneda: c.moneda,
          emisiones: c.emisiones,
          descuentoBps: c.descuentoBps,
          requiereAprobacion: c.requiereAprobacion,
          venceAt: c.venceAt,
          enlace: `${op.portalUrl}/cotizacion/${id}`,
        };
      } catch (e) {
        if (e instanceof HttpError) return { ok: false, error: e.codigo, mensaje: e.mensaje };
        throw e;
      }
    },
  };
}
