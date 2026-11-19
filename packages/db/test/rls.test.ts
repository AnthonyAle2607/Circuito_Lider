import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSistema, withTenant } from '../src/tenant';
import { baseDePrueba } from '../src/testing';

/**
 * Aislamiento entre anunciantes con el rol real de la aplicación (`app_api`): aunque la API tuviera un error y pidiera
 * datos de otro anunciante, la base no se los da. Es la prueba que exige PT-1.
 */
const b = await baseDePrueba();
afterAll(() => b.cerrar());

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeAll(async () => {
  await b.pg.exec(`
    INSERT INTO anunciantes (id, empresa, pais) VALUES ('${A}', 'Anunciante A', 'US'), ('${B}', 'Anunciante B', 'CO');
    INSERT INTO usuarios (anunciante_id, email, nombre, password_hash) VALUES
      ('${A}', 'ana@a.com', 'Ana', 'x'), ('${B}', 'beto@b.com', 'Beto', 'x');`);
  await b.comoApi();
});

describe('RLS por anunciante', () => {
  it('cada anunciante ve solo lo suyo', async () => {
    const deA = await withTenant(b.db, A, (t) => t.selectFrom('usuarios').select('email').execute());
    const deB = await withTenant(b.db, B, (t) => t.selectFrom('usuarios').select('email').execute());
    expect(deA.map((u) => u.email)).toEqual(['ana@a.com']);
    expect(deB.map((u) => u.email)).toEqual(['beto@b.com']);
  });

  it('pedir por id una fila de otro anunciante no devuelve nada', async () => {
    const r = await withTenant(b.db, A, (t) => t.selectFrom('anunciantes').selectAll().where('id', '=', B).execute());
    expect(r).toEqual([]);
  });

  it('sin anunciante en el contexto no se ve nada', async () => {
    const r = await withSistema(b.db, (t) => t.selectFrom('usuarios').selectAll().execute());
    expect(r).toEqual([]);
  });

  it('no se puede escribir a nombre de otro anunciante', async () => {
    await expect(
      withTenant(b.db, A, (t) =>
        t.insertInto('usuarios').values({ anunciante_id: B, email: 'intruso@b.com', nombre: 'X', password_hash: 'x' }).execute(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('el contexto no se filtra a la transacción siguiente', async () => {
    await withTenant(b.db, A, async () => {});
    const r = await withSistema(b.db, (t) => sql<{ v: string | null }>`select current_setting('app.anunciante_id', true) as v`.execute(t));
    expect(r.rows[0]?.v ?? '').toBe('');
  });

  it('la aplicación no puede borrar personas ni cambiar su clave', async () => {
    await expect(withTenant(b.db, A, (t) => t.deleteFrom('usuarios').execute())).rejects.toThrow(/permission denied/);
    await expect(
      withTenant(b.db, A, (t) => t.updateTable('usuarios').set({ password_hash: 'y' }).execute()),
    ).rejects.toThrow(/permission denied/);
  });

  it('el cambio de clave solo pasa por la función, con hash Argon2id y dentro de la propia cuenta', async () => {
    const HASH = '$argon2id$v=19$m=19456,t=2,p=1$prueba';
    const idDe = async (cuenta: string) => (await withTenant(b.db, cuenta, (t) => t.selectFrom('usuarios').select('id').executeTakeFirstOrThrow())).id;
    const ana = await idDe(A);
    const beto = await idDe(B);
    const cambiar = (cuenta: string | null, usuario: string, hash: string) => {
      const q = sql<{ ok: boolean }>`select cambiar_clave_usuario(${usuario}::uuid, ${hash}) as ok`;
      return cuenta ? withTenant(b.db, cuenta, (t) => q.execute(t)) : withSistema(b.db, (t) => q.execute(t));
    };
    expect((await cambiar(A, ana, HASH)).rows[0]!.ok).toBe(true);
    expect((await cambiar(A, beto, HASH)).rows[0]!.ok).toBe(false);
    await expect(cambiar(A, ana, 'clave-en-texto-plano')).rejects.toThrow(/Argon2id/);
    await expect(cambiar(null, ana, HASH)).rejects.toThrow(/withTenant/);
  });

  it('rechaza un anunciante que no es uuid (no se puede inyectar en el contexto)', async () => {
    await expect(withTenant(b.db, "x' or '1'='1", async () => {})).rejects.toThrow(/uuid/);
  });

  it('el ingreso encuentra al usuario por correo sin ver nada más', async () => {
    const r = await sql<{ id: string; anunciante_id: string; activo: boolean }>`
      select id, anunciante_id, activo from buscar_usuario_para_ingreso('BETO@b.com')`.execute(b.db);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ anunciante_id: B, activo: true });
  });

  it('el catálogo es público para la aplicación pero de solo lectura', async () => {
    await expect(b.db.selectFrom('emisoras').selectAll().execute()).resolves.toEqual([]);
    await expect(b.db.insertInto('circuitos').values({ nombre: 'X' }).execute()).rejects.toThrow(/permission denied/);
  });
});
