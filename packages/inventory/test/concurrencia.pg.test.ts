import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, runMigrations } from '@sp/db';
import { SinCupo, tomarCupos } from '../src/index';

/**
 * Criterio de terminado de PT-3: 50 reservas simultáneas sobre el último cupo, solo una gana.
 * PGlite tiene una sola conexión y no puede probar concurrencia real: esto corre contra un Postgres de verdad, con
 * 50 conexiones a la vez. Necesita PRUEBAS_PG_URL (un superusuario: crea y borra una base desechable). En la CI lo da el
 * servicio de Postgres; en la laptop: PRUEBAS_PG_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
 */
const URL_ADMIN = process.env.PRUEBAS_PG_URL;
const MIGRACIONES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations');
const nombre = `prueba_concurrencia_${randomBytes(4).toString('hex')}`;

describe.skipIf(!URL_ADMIN)('concurrencia en Postgres real', () => {
  let urlBase = '';
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: URL_ADMIN });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nombre}`);
    await admin.end();
    const u = new URL(URL_ADMIN!);
    u.pathname = `/${nombre}`;
    urlBase = u.toString();
    const c = new pg.Client({ connectionString: urlBase });
    await c.connect();
    await runMigrations(c, MIGRACIONES);
    await c.end();
    db = createDb(urlBase, 60);
  });

  afterAll(async () => {
    await db?.destroy();
    const admin = new pg.Client({ connectionString: URL_ADMIN });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
    await admin.end();
  });

  async function franjaCon(segundosTanda: number): Promise<string> {
    const c = new pg.Client({ connectionString: urlBase });
    await c.connect();
    const n = randomBytes(3).toString('hex');
    const circ = (await c.query(`INSERT INTO circuitos (nombre) VALUES ($1) RETURNING id`, [`C${n}`])).rows[0].id;
    const prog = (await c.query(`INSERT INTO programas (circuito_id, nombre, alcance) VALUES ($1, 'P', 'nacional') RETURNING id`, [circ])).rows[0].id;
    const f = (
      await c.query(`INSERT INTO franjas (programa_id, dia_semana, hora_inicio, hora_fin, segundos_tanda) VALUES ($1, 1, '06:00', '07:00', $2) RETURNING id`, [
        prog,
        segundosTanda,
      ])
    ).rows[0].id;
    await c.end();
    return f;
  }

  /** Lanza N reservas a la vez, cada una en su propia transacción y su propia conexión. */
  async function aLaVez(franjaId: string, n: number, segundos: number) {
    const resultados = await Promise.allSettled(
      Array.from({ length: n }, () => db.transaction().execute((t) => tomarCupos(t, [{ franjaId, fecha: '2026-12-07', segundos }]))),
    );
    const ganan = resultados.filter((r) => r.status === 'fulfilled').length;
    const otros = resultados.filter((r) => r.status === 'rejected' && !(r.reason instanceof SinCupo));
    const c = new pg.Client({ connectionString: urlBase });
    await c.connect();
    const usados = (await c.query(`SELECT segundos_usados FROM cupos WHERE franja_id = $1`, [franjaId])).rows[0]?.segundos_usados;
    await c.end();
    return { ganan, otros, usados };
  }

  it('50 reservas sobre el último cupo: gana exactamente una', async () => {
    const f = await franjaCon(30);
    const r = await aLaVez(f, 50, 30);
    expect(r.otros).toEqual([]);
    expect(r.ganan).toBe(1);
    expect(r.usados).toBe(30);
  });

  it('50 reservas de 30 s sobre 120 s libres: ganan exactamente cuatro', async () => {
    const f = await franjaCon(120);
    const r = await aLaVez(f, 50, 30);
    expect(r.otros).toEqual([]);
    expect(r.ganan).toBe(4);
    expect(r.usados).toBe(120);
  });
});
