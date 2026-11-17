import type { Transaction } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@sp/db';
import { baseDePrueba } from '@sp/db/testing';
import { SinCupo, devolverCupos, diaIso, hoyEnCaracas, segundosLibres, sumarDias, tomarCupos } from '../src/index';

const b = await baseDePrueba();
afterAll(() => b.cerrar());
let franja = '';
let otra = '';

beforeAll(async () => {
  const id = async (q: string) => (await b.pg.query<{ id: string }>(q)).rows[0]!.id;
  const c = await id(`INSERT INTO circuitos (nombre) VALUES ('C') RETURNING id`);
  const p = await id(`INSERT INTO programas (circuito_id, nombre, alcance) VALUES ('${c}', 'P', 'nacional') RETURNING id`);
  franja = await id(`INSERT INTO franjas (programa_id, dia_semana, hora_inicio, hora_fin, segundos_tanda) VALUES ('${p}', 1, '06:00', '07:00', 90) RETURNING id`);
  otra = await id(`INSERT INTO franjas (programa_id, dia_semana, hora_inicio, hora_fin, segundos_tanda) VALUES ('${p}', 2, '06:00', '07:00', 30) RETURNING id`);
  await b.comoApi();
});

const tx = <T>(fn: (t: Transaction<Database>) => Promise<T>) => b.db.transaction().execute(fn);

describe('cupos (con el rol de la API)', () => {
  it('toma segundos hasta llenar y luego rechaza', async () => {
    await tx((t) => tomarCupos(t, [{ franjaId: franja, fecha: '2026-12-07', segundos: 60 }]));
    await tx((t) => tomarCupos(t, [{ franjaId: franja, fecha: '2026-12-07', segundos: 30 }]));
    await expect(tx((t) => tomarCupos(t, [{ franjaId: franja, fecha: '2026-12-07', segundos: 30 }]))).rejects.toThrow(SinCupo);
    const [l] = await segundosLibres(b.db, [{ franjaId: franja, fecha: '2026-12-07' }]);
    expect(l).toMatchObject({ capacidad: 90, usados: 90, libres: 0 });
  });

  it('si una franja no cabe, no se toma ninguna (todo o nada) y dice cuáles faltan', async () => {
    const err = await tx((t) =>
      tomarCupos(t, [
        { franjaId: franja, fecha: '2026-12-14', segundos: 30 },
        { franjaId: otra, fecha: '2026-12-08', segundos: 60 },
      ]),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(SinCupo);
    expect(err.faltantes).toEqual([{ franjaId: otra, fecha: '2026-12-08' }]);
    const [l] = await segundosLibres(b.db, [{ franjaId: franja, fecha: '2026-12-14' }]);
    expect(l!.usados).toBe(0);
  });

  it('devolver deja el cupo libre otra vez', async () => {
    await tx((t) => devolverCupos(t, [{ franjaId: franja, fecha: '2026-12-07', segundos: 30 }]));
    const [l] = await segundosLibres(b.db, [{ franjaId: franja, fecha: '2026-12-07' }]);
    expect(l!.libres).toBe(30);
  });

  it('una franja que dejó de venderse no admite reservas', async () => {
    await b.comoDueno();
    await b.pg.query(`UPDATE franjas SET activa = false WHERE id = $1`, [otra]);
    await b.comoApi();
    await expect(tx((t) => tomarCupos(t, [{ franjaId: otra, fecha: '2026-12-15', segundos: 10 }]))).rejects.toThrow(SinCupo);
    expect(await segundosLibres(b.db, [{ franjaId: otra, fecha: '2026-12-15' }])).toEqual([]);
  });

  it('si programación baja la tanda, vale la nueva capacidad', async () => {
    await b.comoDueno();
    await b.pg.query(`UPDATE franjas SET segundos_tanda = 20 WHERE id = $1`, [franja]);
    await b.comoApi();
    await expect(tx((t) => tomarCupos(t, [{ franjaId: franja, fecha: '2026-12-21', segundos: 30 }]))).rejects.toThrow(SinCupo);
  });
});

describe('fechas', () => {
  it('calcula el día ISO sin depender de la zona horaria', () => {
    expect(diaIso('2026-11-16')).toBe(1); // lunes
    expect(diaIso('2026-11-22')).toBe(7); // domingo
  });

  it('hoy en Caracas: a las 02:00 UTC todavía es el día anterior', () => {
    expect(hoyEnCaracas(new Date('2026-11-18T02:00:00Z'))).toBe('2026-11-17');
    expect(hoyEnCaracas(new Date('2026-11-18T05:00:00Z'))).toBe('2026-11-18');
  });

  it('suma días cruzando meses', () => {
    expect(sumarDias('2026-11-28', 5)).toBe('2026-12-03');
  });
});
