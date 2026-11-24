import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { almacenDelEntorno, almacenLocal } from '../src/almacen';

const temporales: string[] = [];

afterEach(async () => {
  await Promise.all(temporales.splice(0).map((ruta) => rm(ruta, { recursive: true, force: true })));
});

async function directorioTemporal() {
  const ruta = await mkdtemp(join(tmpdir(), 'sp-almacen-'));
  temporales.push(ruta);
  return ruta;
}

describe('almacén local', () => {
  it('guarda y lee archivos en subdirectorios, incluso desde otra instancia', async () => {
    const raiz = await directorioTemporal();
    const original = Buffer.from('spot de prueba');

    await almacenLocal(raiz).guardar('anuncios/cliente/spot.mp3', original, 'audio/mpeg');

    await expect(almacenLocal(raiz).leer('anuncios/cliente/spot.mp3')).resolves.toEqual(original);
  });

  it('rechaza claves que intentan salir del directorio configurado', async () => {
    const raiz = await directorioTemporal();

    await expect(almacenLocal(raiz).guardar('../fuera.mp3', Buffer.from('x'), 'audio/mpeg')).rejects.toThrow(
      'clave de archivo fuera del almacén',
    );
  });

  it('prefiere SPOTS_DIR sobre S3 para el servidor sin almacenamiento cloud', async () => {
    const raiz = await directorioTemporal();
    const archivo = join(raiz, 'spot.mp3');
    await almacenDelEntorno({ SPOTS_DIR: raiz, S3_ENDPOINT: 'not-an-endpoint' })!.guardar('spot.mp3', Buffer.from('local'), 'audio/mpeg');

    await expect(readFile(archivo, 'utf8')).resolves.toBe('local');
  });
});
