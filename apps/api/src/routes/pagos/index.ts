/**
 * Pagos (PT-5): pagar por pasarela (sesión alojada + aviso firmado), por transferencia (comprobante + revisión de
 * finanzas) y la página de la pasarela de prueba. Los estados los cambian las funciones de la base (0010_pagos).
 */
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@sp/db';
import type { Pasarela, PasarelaDePrueba } from '@sp/payments';
import type { DatosTransferencia } from '@sp/schemas';
import type { Almacen } from '@sp/spots';
import { rutaAviso } from './aviso';
import { rutaPagar } from './pagar';
import { rutaPasarelaPrueba } from './pasarela-prueba';
import { rutaTransferencia } from './transferencia';

export { aplicarAviso } from './aviso';
export { pagosDe } from './comun';

export interface OpcionesPagos {
  db: Kysely<Database>;
  pasarela: Pasarela;
  portalUrl: string;
  /** Sin almacén no se aceptan comprobantes de transferencia. */
  almacen?: Almacen;
  transferencia?: { datos: DatosTransferencia; maximoBytes: number };
}

const esDePrueba = (p: Pasarela): p is PasarelaDePrueba => p.nombre === 'prueba' && 'resolver' in p;

export async function rutasPagos(app: FastifyInstance, op: OpcionesPagos): Promise<void> {
  rutaPagar(app, op);
  await rutaAviso(app, op);
  if (esDePrueba(op.pasarela)) await rutaPasarelaPrueba(app, op.pasarela, op.portalUrl);
  if (op.almacen && op.transferencia) rutaTransferencia(app, { db: op.db, almacen: op.almacen, ...op.transferencia });
}
