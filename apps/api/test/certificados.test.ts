import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarParrilla, cargarTarifarioEjemplo, leerArchivoParrilla } from '@sp/catalogo';
import { diaIso, hoyEnCaracas, sumarDias } from '@sp/inventory';
import { Anuncio, Certificado, Cotizacion, Pedido } from '@sp/schemas';
import { almacenEnMemoria } from '@sp/spots';
import { TERMINOS_POR_DEFECTO } from '../src/app';
import { montar } from './ayuda';

const almacen = almacenEnMemoria();
const m = await montar({ almacen });
afterAll(() => m.cerrar());
const DATOS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos');

function proximo(dia: number, semanas = 0): string {
  let f = sumarDias(hoyEnCaracas(), 1);
  while (diaIso(f) !== dia) f = sumarDias(f, 1);
  return sumarDias(f, semanas * 7);
}
let encendidosLunes = '';
let caracas = '';
let valencia = '';

beforeAll(async () => {
  await m.dueño(async () => {
    await cargarParrilla(m.b.db, leerArchivoParrilla(`${DATOS}/circuito-lider.yaml`));
    await cargarTarifarioEjemplo(m.b.db, `${DATOS}/tarifario-ejemplo.yaml`);
  });
  encendidosLunes = (await m.q<{ id: string }>(`SELECT f.id FROM franjas f JOIN programas p ON p.id = f.programa_id WHERE p.nombre = 'ENCENDIDOS' AND f.dia_semana = 1`))[0]!.id;
  caracas = (await m.q<{ id: string }>(`SELECT id FROM emisoras WHERE slug = 'caracas'`))[0]!.id;
  valencia = (await m.q<{ id: string }>(`SELECT id FROM emisoras WHERE slug = 'valencia'`))[0]!.id;
});

const MP3 = Buffer.from('ID3 spot');
function multipart(nombre: string) {
  const l = '----x' + Math.random().toString(16).slice(2);
  const payload = Buffer.concat([
    Buffer.from(`--${l}\r\nContent-Disposition: form-data; name="nombre"\r\n\r\n${nombre}\r\n--${l}\r\nContent-Disposition: form-data; name="archivo"; filename="s.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
    MP3,
    Buffer.from(`\r\n--${l}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${l}` } };
}

/** Un cliente con un pedido de ENCENDIDOS el próximo lunes y un anuncio (aprobado o no). */
async function escenario(op: { aprobar: boolean; semana: number }) {
  const a = await m.anunciante();
  const fecha = proximo(1, op.semana);
  const c = Cotizacion.parse(
    (await m.app.inject({ method: 'POST', url: '/v1/cotizaciones', headers: m.ip(), payload: { duracionSegundos: 30, emisiones: [{ franjaId: encendidosLunes, fecha }] } })).json(),
  );
  const p = Pedido.parse(
    (await m.app.inject({ method: 'POST', url: `/v1/cotizaciones/${c.id}/reservar`, headers: a.auth, payload: { aceptaTerminos: true, terminosVersion: TERMINOS_POR_DEFECTO } })).json(),
  );
  const b = multipart('Navidad');
  const anuncio = Anuncio.parse((await m.app.inject({ method: 'POST', url: '/v1/anuncios', payload: b.payload, headers: { ...a.auth, ...b.headers } })).json());
  if (op.aprobar) await m.q(`UPDATE anuncios SET estado = 'aprobado' WHERE id = $1`, [anuncio.id]);
  return { a, p, anuncio, fecha };
}

/** Un bloque de una hora grabado en una emisora, de 06:00 a 07:00 hora de Caracas de esa fecha. */
async function bloque(emisora: string, fecha: string) {
  const [g] = await m.q<{ id: string }>(
    `INSERT INTO grabaciones (emisora_id, archivo, inicio_at, fin_at, bytes)
     VALUES ($1, $2, ($3::date + time '06:00') AT TIME ZONE 'America/Caracas', ($3::date + time '07:00') AT TIME ZONE 'America/Caracas', 1000)
     RETURNING id`,
    [emisora, `prueba/${emisora}-${fecha}-${Math.random()}.mka`, fecha],
  );
  return g!.id;
}

async function comoTrabajador<T>(fn: () => Promise<T>): Promise<T> {
  await m.b.comoWorker();
  try {
    return await fn();
  } finally {
    await m.b.comoApi();
  }
}

describe('el anuncio de cada pedido', () => {
  it('solo se asigna un anuncio aprobado de la propia cuenta', async () => {
    const s = await escenario({ aprobar: false, semana: 1 });
    const asignar = (auth: Record<string, string>, anuncioId: string) =>
      m.app.inject({ method: 'PUT', url: `/v1/pedidos/${s.p.id}/anuncio`, headers: auth, payload: { anuncioId } });
    expect((await asignar(s.a.auth, s.anuncio.id)).json().error).toBe('anuncio_no_aprobado');
    const otro = await escenario({ aprobar: true, semana: 2 });
    expect((await asignar(s.a.auth, otro.anuncio.id)).json().error).toBe('anuncio_no_existe');
    await m.q(`UPDATE anuncios SET estado = 'aprobado' WHERE id = $1`, [s.anuncio.id]);
    const r = await asignar(s.a.auth, s.anuncio.id);
    expect(Pedido.parse(r.json()).anuncioId).toBe(s.anuncio.id);
  });
});

describe('detección y certificado', () => {
  it('el bloque grabado pide buscar el spot en la franja; el certificado se guarda una vez y no se puede tocar', async () => {
    const s = await escenario({ aprobar: true, semana: 3 });
    await m.app.inject({ method: 'PUT', url: `/v1/pedidos/${s.p.id}/anuncio`, headers: s.a.auth, payload: { anuncioId: s.anuncio.id } });
    const g = await bloque(caracas, s.fecha);

    // ENCENDIDOS va en cadena: también se busca en Valencia; en un bloque de otro día no.
    const cand = await comoTrabajador(async () => (await m.b.pg.query<Record<string, unknown>>('SELECT * FROM candidatos_de_grabacion($1)', [g])).rows);
    const mio = cand.filter((c) => c.pedido_id === s.p.id);
    expect(mio).toHaveLength(1);
    expect(mio[0]).toMatchObject({ anuncio_id: s.anuncio.id, archivo_clave: expect.stringContaining('anuncios/') });
    const gv = await bloque(valencia, s.fecha);
    const otroDia = await bloque(caracas, sumarDias(s.fecha, 1));
    await comoTrabajador(async () => {
      expect((await m.b.pg.query<{ pedido_id: string }>('SELECT * FROM candidatos_de_grabacion($1)', [gv])).rows.some((c) => c.pedido_id === s.p.id)).toBe(true);
      expect((await m.b.pg.query<{ pedido_id: string }>('SELECT * FROM candidatos_de_grabacion($1)', [otroDia])).rows.some((c) => c.pedido_id === s.p.id)).toBe(false);
    });

    await almacen.guardar('certificados/clip.mp3', Buffer.from('clip'), 'audio/mpeg');
    const sha = Buffer.alloc(32, 7);
    const certificar = (minuto: number) =>
      comoTrabajador(async () =>
        (
          await m.b.pg.query<{ id: string | null }>(`SELECT certificar_emision($1, $2, $3, $4, ($5::date + $6::time) AT TIME ZONE 'America/Caracas', 31000, 0.93, 'certificados/clip.mp3', $7) AS id`, [
            s.p.id,
            s.anuncio.id,
            mio[0]!.reserva_id,
            g,
            s.fecha,
            `06:${String(minuto).padStart(2, '0')}:10`,
            sha,
          ])
        ).rows[0]!.id,
      );
    const id = await certificar(42);
    expect(id).toBeTruthy();
    expect(await certificar(42)).toBeNull(); // el mismo hallazgo otra vez no duplica

    const lista = Certificado.array().parse((await m.app.inject({ url: '/v1/certificados', headers: s.a.auth })).json());
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id, pedidoId: s.p.id, anuncio: { nombre: 'Navidad' }, emisora: { ciudad: 'Caracas' }, duracionMs: 31000, parecido: 0.93, sha256: sha.toString('hex') });
    const audio = await m.app.inject({ url: `/v1/certificados/${id}/audio`, headers: s.a.auth });
    expect(audio.headers['content-type']).toBe('audio/mpeg');
    expect(audio.body).toBe('clip');
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'emision.certificada' AND entidad_id = $1`, [id])).toHaveLength(1);

    // Nadie más lo ve, y ni el dueño de la base puede cambiarlo o borrarlo.
    const otro = await m.anunciante();
    expect((await m.app.inject({ url: `/v1/certificados/${id}`, headers: otro.auth })).statusCode).toBe(404);
    await expect(m.q(`UPDATE certificados SET parecido = 1 WHERE id = $1`, [id])).rejects.toThrow();
    await expect(m.q(`DELETE FROM certificados WHERE id = $1`, [id])).rejects.toThrow();
  });

  it('sin anuncio asignado no hay nada que buscar', async () => {
    const s = await escenario({ aprobar: true, semana: 4 });
    const g = await bloque(caracas, s.fecha);
    const cand = await comoTrabajador(async () => (await m.b.pg.query<{ pedido_id: string }>('SELECT * FROM candidatos_de_grabacion($1)', [g])).rows);
    expect(cand.some((c) => c.pedido_id === s.p.id)).toBe(false);
  });
});
