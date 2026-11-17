import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDePrueba } from '@sp/db/testing';
import { registrar, verificar } from '../src/index';

const b = await baseDePrueba();
afterAll(() => b.cerrar());

const anunciante = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  await b.pg.query(`INSERT INTO anunciantes (id, empresa, pais) VALUES ($1, 'Acme', 'US')`, [anunciante]);
});

describe('bitácora encadenada', () => {
  it('encadena cada fila con la anterior y verifica íntegra', async () => {
    await b.comoApi();
    for (let i = 0; i < 5; i++) {
      await registrar(b.db, {
        anuncianteId: anunciante,
        actor: { tipo: 'anunciante', id: anunciante },
        accion: 'prueba.registrada',
        entidad: 'prueba',
        entidadId: String(i),
        datos: { n: i, texto: 'ñandú · 30 s' },
        ip: '10.0.0.1',
      });
    }
    const v = await verificar(b.db);
    await b.comoDueno();
    expect(v).toEqual({ filas: 5, primeraRota: null, integra: true });
    const { rows } = await b.pg.query<{ enlazada: boolean }>(
      'select hash_prev = lag(hash) over (order by id) as enlazada from bitacora order by id',
    );
    expect(rows.slice(1).every((r) => r.enlazada)).toBe(true);
  });

  it('el trabajo en segundo plano puede añadir aunque no pueda leer', async () => {
    await b.comoWorker();
    await registrar(b.db, { actor: { tipo: 'sistema', nombre: 'liberar-reservas' }, accion: 'reserva.liberada', entidad: 'reserva', entidadId: 'r1' });
    await expect(b.pg.query('select * from bitacora')).rejects.toThrow(/permission denied/);
    await b.comoDueno();
  });

  it('nadie puede cambiar ni borrar una fila, ni siquiera el dueño', async () => {
    await expect(b.pg.query(`update bitacora set accion = 'otra' where id = 1`)).rejects.toThrow(/solo añadir/);
    await expect(b.pg.query('delete from bitacora where id = 1')).rejects.toThrow(/solo añadir/);
    await expect(b.pg.query('truncate bitacora')).rejects.toThrow(/solo añadir/);
  });

  it('la aplicación no tiene permiso para cambiarla', async () => {
    await b.comoApi();
    await expect(b.pg.query(`update bitacora set accion = 'otra' where id = 1`)).rejects.toThrow(/permission denied/);
    await b.comoDueno();
  });

  it('detecta una fila alterada por fuera (apagando los triggers)', async () => {
    await b.pg.exec(`
      ALTER TABLE bitacora DISABLE TRIGGER bitacora_sin_cambios;
      UPDATE bitacora SET datos = '{"n": 99}' WHERE id = 3;
      ALTER TABLE bitacora ENABLE TRIGGER bitacora_sin_cambios;`);
    const v = await verificar(b.db);
    expect(v.integra).toBe(false);
    expect(v.primeraRota).toBe('3');
  });

  it('detecta un borrado en medio de la cadena', async () => {
    const otra = await baseDePrueba();
    for (let i = 0; i < 3; i++) {
      await registrar(otra.db, { actor: { tipo: 'sistema', nombre: 'p' }, accion: 'a.b', entidad: 'e', entidadId: String(i) });
    }
    await otra.pg.exec(`
      ALTER TABLE bitacora DISABLE TRIGGER bitacora_sin_cambios;
      DELETE FROM bitacora WHERE id = 2;
      ALTER TABLE bitacora ENABLE TRIGGER bitacora_sin_cambios;`);
    expect((await verificar(otra.db)).primeraRota).toBe('3');
    await otra.cerrar();
  });
});
