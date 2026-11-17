import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate';

async function carpetaCon(archivos: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'migraciones-'));
  for (const [nombre, sqlTexto] of Object.entries(archivos)) await writeFile(join(dir, nombre), sqlTexto);
  return dir;
}

describe('runMigrations', () => {
  it('aplica en orden, una sola vez', async () => {
    const db = new PGlite();
    const dir = await carpetaCon({
      '0002_b.sql': 'insert into a values (2);',
      '0001_a.sql': 'create table a (n int); insert into a values (1);',
      'notas.md': 'se ignora',
    });
    expect((await runMigrations(db, dir)).applied).toEqual(['0001_a.sql', '0002_b.sql']);
    expect((await runMigrations(db, dir)).skipped).toEqual(['0001_a.sql', '0002_b.sql']);
    const { rows } = await db.query<{ n: number }>('select n from a order by n');
    expect(rows.map((r) => r.n)).toEqual([1, 2]);
  });

  it('se niega a seguir si una migración aplicada cambió', async () => {
    const db = new PGlite();
    const dir = await carpetaCon({ '0001_a.sql': 'create table a (n int);' });
    await runMigrations(db, dir);
    await writeFile(join(dir, '0001_a.sql'), 'create table a (n bigint);');
    await expect(runMigrations(db, dir)).rejects.toThrow(/fue modificada/);
  });

  it('deshace una migración que falla', async () => {
    const db = new PGlite();
    const dir = await carpetaCon({ '0001_a.sql': 'create table a (n int); select * from no_existe;' });
    await expect(runMigrations(db, dir)).rejects.toThrow(/0001_a.sql/);
    const { rows } = await db.query("select to_regclass('a') as t");
    expect(rows[0]).toEqual({ t: null });
  });
});
