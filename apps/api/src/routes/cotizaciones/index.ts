/**
 * Rutas de venta: disponibilidad (pública), cotizar (sin cuenta) y reservar (anunciante con correo verificado).
 * Una ruta por archivo; `lectura.ts` arma la cotización como la ve el cliente (la usa también el panel de ventas).
 */
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@sp/db';
import { rutaCotizar } from './cotizar';
import { rutaDisponibilidad } from './disponibilidad';
import { rutaReservar } from './reservar';

export { crearCotizacion } from './crear';
export { leerCotizacion } from './lectura';

export interface OpcionesCotizaciones {
  db: Kysely<Database>;
  /** Versión vigente de los términos que el cliente acepta al reservar. */
  terminosVersion: string;
  limiteCotizar: number;
}

export async function rutasCotizaciones(app: FastifyInstance, op: OpcionesCotizaciones): Promise<void> {
  rutaDisponibilidad(app, op.db);
  rutaCotizar(app, op.db, op.limiteCotizar);
  rutaReservar(app, op.db, op.terminosVersion);
}
