import { afterAll, describe, expect, it } from 'vitest';
import { Anuncio, AnuncioEnRevision } from '@sp/schemas';
import { almacenEnMemoria } from '@sp/spots';
import { montar } from './ayuda';

const almacen = almacenEnMemoria();
const m = await montar({ almacen });
afterAll(() => m.cerrar());

/** Arma un cuerpo multipart a mano (el que mandaría el navegador o el portal). */
function multipart(campos: Record<string, string>, archivo?: { nombre: string; datos: Buffer; tipo?: string }) {
  const limite = '----prueba' + Math.random().toString(16).slice(2);
  const partes: Buffer[] = [];
  for (const [k, v] of Object.entries(campos)) {
    partes.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (archivo) {
    partes.push(
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${archivo.nombre}"\r\nContent-Type: ${archivo.tipo ?? 'audio/mpeg'}\r\n\r\n`),
      archivo.datos,
      Buffer.from('\r\n'),
    );
  }
  partes.push(Buffer.from(`--${limite}--\r\n`));
  return { payload: Buffer.concat(partes), headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

const subir = (auth: Record<string, string>, campos: Record<string, string>, archivo?: { nombre: string; datos: Buffer }) => {
  const b = multipart(campos, archivo);
  return m.app.inject({ method: 'POST', url: '/v1/anuncios', payload: b.payload, headers: { ...auth, ...b.headers } });
};
const MP3 = Buffer.from('ID3 contenido de prueba');

/** Lo que hace el trabajo de revisión, con el rol real de los trabajadores. */
async function trabajador(estado: string, motivo: string | null, coincidencias: unknown[] = []) {
  await m.b.comoWorker();
  try {
    const { rows } = await m.b.pg.query<{ id: string }>('select * from tomar_anuncio_pendiente()');
    const id = rows[0]?.id;
    if (id) {
      await m.b.pg.query('select resolver_anuncio($1, $2, $3, $4, $5, $6)', [id, estado, motivo, 31_000, 'Texto del spot', JSON.stringify(coincidencias)]);
    }
    return id;
  } finally {
    await m.b.comoApi();
  }
}

describe('subir un anuncio', () => {
  it('guarda el archivo, crea el anuncio «procesando» y deja constancia', async () => {
    const a = await m.anunciante();
    const r = await subir(a.auth, { nombre: 'Navidad 30 s' }, { nombre: 'navidad.mp3', datos: MP3 });
    expect(r.statusCode).toBe(201);
    const x = Anuncio.parse(r.json());
    expect(x).toMatchObject({ nombre: 'Navidad 30 s', formato: 'mp3', estado: 'procesando', bytes: MP3.length, archivoNombre: 'navidad.mp3' });
    expect(almacen.claves()).toContain(`anuncios/${a.anuncianteId}/${x.id}.mp3`);
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'anuncio.subido' AND entidad_id = $1`, [x.id])).toHaveLength(1);

    const lista = Anuncio.array().parse((await m.app.inject({ url: '/v1/anuncios', headers: a.auth })).json());
    expect(lista.map((y) => y.id)).toContain(x.id);
    const audio = await m.app.inject({ url: `/v1/anuncios/${x.id}/archivo`, headers: a.auth });
    expect(audio.headers['content-type']).toBe('audio/mpeg');
    expect(audio.rawPayload.equals(MP3)).toBe(true);
  });

  it('sin nombre usa el del archivo', async () => {
    const a = await m.anunciante();
    const x = Anuncio.parse((await subir(a.auth, {}, { nombre: 'Promo Verano.wav', datos: MP3 })).json());
    expect(x).toMatchObject({ nombre: 'Promo Verano', formato: 'wav' });
  });

  it('rechaza otros formatos y la subida sin archivo', async () => {
    const a = await m.anunciante();
    expect((await subir(a.auth, { nombre: 'X' }, { nombre: 'spot.mov', datos: MP3 })).json().error).toBe('formato');
    expect((await subir(a.auth, { nombre: 'X' })).json().error).toBe('sin_archivo');
  });

  it('sin sesión no se sube, y nadie ve los anuncios de otra cuenta', async () => {
    expect((await subir({}, { nombre: 'X' }, { nombre: 'a.mp3', datos: MP3 })).statusCode).toBe(401);
    const a = await m.anunciante();
    const b = await m.anunciante();
    const x = Anuncio.parse((await subir(a.auth, { nombre: 'Secreto' }, { nombre: 'a.mp3', datos: MP3 })).json());
    expect((await m.app.inject({ url: `/v1/anuncios/${x.id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await m.app.inject({ url: `/v1/anuncios/${x.id}/archivo`, headers: b.auth })).statusCode).toBe(404);
    expect(Anuncio.array().parse((await m.app.inject({ url: '/v1/anuncios', headers: b.auth })).json())).toEqual([]);
  });
});

describe('revisión', () => {
  it('el trabajo toma cada anuncio una vez y guarda su resultado', async () => {
    await m.q(`UPDATE anuncios SET estado = 'rechazado' WHERE estado = 'procesando'`);
    const a = await m.anunciante();
    const x = Anuncio.parse((await subir(a.auth, { nombre: 'Limpio' }, { nombre: 'a.mp3', datos: MP3 })).json());
    expect(await trabajador('aprobado', null)).toBe(x.id);
    expect(await trabajador('aprobado', null)).toBeUndefined();
    const visto = Anuncio.parse((await m.app.inject({ url: `/v1/anuncios/${x.id}`, headers: a.auth })).json());
    expect(visto).toMatchObject({ estado: 'aprobado', duracionMs: 31_000, transcripcion: 'Texto del spot' });
    expect(await m.q(`SELECT 1 FROM outbox WHERE tipo = 'anuncio.revisado' AND datos->>'anuncio_id' = $1`, [x.id])).toHaveLength(1);
  });

  it('lo dudoso llega al revisor, que lo escucha y decide; el cliente ve el motivo', async () => {
    const a = await m.anunciante();
    const x = Anuncio.parse((await subir(a.auth, { nombre: 'Con grosería' }, { nombre: 'a.mp3', datos: MP3 })).json());
    await trabajador('en_revision', 'Una persona lo revisa: se oyó «mierda».', [{ palabra: 'mierda', segundo: 12, contexto: 'qué mierda' }]);

    const ventas = await m.sesionEquipo(['ventas']);
    expect((await m.app.inject({ url: '/v1/panel/anuncios', headers: ventas })).statusCode).toBe(403);

    const revisor = await m.sesionEquipo(['revisor']);
    const cola = AnuncioEnRevision.array().parse((await m.app.inject({ url: '/v1/panel/anuncios', headers: revisor })).json());
    const enCola = cola.find((y) => y.id === x.id)!;
    expect(enCola).toMatchObject({ nombre: 'Con grosería', coincidencias: [{ palabra: 'mierda', segundo: 12 }] });
    expect(enCola.empresa).toMatch(/^Empresa/);
    const audio = await m.app.inject({ url: `/v1/panel/anuncios/${x.id}/archivo`, headers: revisor });
    expect(audio.rawPayload.equals(MP3)).toBe(true);

    const sinMotivo = await m.app.inject({ method: 'POST', url: `/v1/panel/anuncios/${x.id}/decision`, headers: revisor, payload: { decision: 'rechazar' } });
    expect(sinMotivo.statusCode).toBe(400);
    const ok = await m.app.inject({
      method: 'POST',
      url: `/v1/panel/anuncios/${x.id}/decision`,
      headers: revisor,
      payload: { decision: 'rechazar', motivo: 'Quita la palabra del segundo 12 y súbelo de nuevo.' },
    });
    expect(ok.statusCode).toBe(204);
    const otra = await m.app.inject({ method: 'POST', url: `/v1/panel/anuncios/${x.id}/decision`, headers: revisor, payload: { decision: 'aprobar' } });
    expect(otra.statusCode).toBe(409);

    const visto = Anuncio.parse((await m.app.inject({ url: `/v1/anuncios/${x.id}`, headers: a.auth })).json());
    expect(visto).toMatchObject({ estado: 'rechazado', motivo: 'Quita la palabra del segundo 12 y súbelo de nuevo.' });
    expect(await m.q(`SELECT 1 FROM bitacora WHERE accion = 'anuncio.rechazado' AND entidad_id = $1`, [x.id])).toHaveLength(1);
    // Ya decidido, el revisor no puede bajar el archivo de un anuncio que no está en revisión.
    expect((await m.app.inject({ url: `/v1/panel/anuncios/${x.id}/archivo`, headers: revisor })).statusCode).toBe(404);
  });

  it('la API no puede cambiar el estado de un anuncio por su cuenta', async () => {
    const a = await m.anunciante();
    const x = Anuncio.parse((await subir(a.auth, { nombre: 'Intento' }, { nombre: 'a.mp3', datos: MP3 })).json());
    await expect(m.b.pg.query(`UPDATE anuncios SET estado = 'aprobado' WHERE id = $1`, [x.id])).rejects.toThrow(/permission denied/);
  });
});
