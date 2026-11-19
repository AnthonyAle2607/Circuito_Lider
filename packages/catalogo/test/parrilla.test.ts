import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { baseDePrueba } from '@sp/db/testing';
import { ArchivoParrilla, cargarParrilla, leerArchivoParrilla, listarEmisoras, parrillaDeEmisora, segundosEstimados } from '../src/index';

const ARCHIVO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../datos/circuito-lider.yaml');
const b = await baseDePrueba();
afterAll(() => b.cerrar());
const archivo = leerArchivoParrilla(ARCHIVO);

describe('archivo de Circuito Líder', () => {
  it('tiene las diez emisoras con frecuencias válidas', () => {
    expect(archivo.emisoras).toHaveLength(10);
    expect(new Set(archivo.emisoras.map((e) => e.slug)).size).toBe(10);
  });

  it('rechaza una franja que cruza la medianoche sin partir', () => {
    const malo = { ...archivo, nacionales: [{ nombre: 'X', franjas: [{ dias: [1], inicio: '21:00', fin: '01:00' }] }] };
    expect(ArchivoParrilla.safeParse(malo).success).toBe(false);
  });

  it('rechaza programas locales de una emisora que no existe', () => {
    const malo = { ...archivo, locales: { atlantis: archivo.locales.caracas } };
    expect(ArchivoParrilla.safeParse(malo).success).toBe(false);
  });

  it('estima la tanda en proporción a la duración', () => {
    expect(segundosEstimados('06:00', '09:00', 240)).toBe(720);
    expect(segundosEstimados('15:15', '16:15', 240)).toBe(240);
    expect(segundosEstimados('21:00', '24:00', 240)).toBe(720);
  });
});

describe('carga', () => {
  it('carga todo una vez y repetirla no duplica', async () => {
    const r1 = await cargarParrilla(b.db, archivo);
    expect(r1.emisoras).toBe(10);
    expect(r1.programas).toBe(3 + 6 + 3 + 1);
    const r2 = await cargarParrilla(b.db, archivo);
    expect(r2).toEqual({ emisoras: 0, programas: 0, franjas: 0 });
  });

  it('no pisa una franja corregida en el panel', async () => {
    await b.pg.query(
      `UPDATE franjas SET segundos_tanda = 999, cupo_confirmado = true
        WHERE programa_id = (SELECT id FROM programas WHERE nombre = 'ENCENDIDOS') AND dia_semana = 1`,
    );
    await cargarParrilla(b.db, archivo);
    const { rows } = await b.pg.query<{ segundos_tanda: number }>(
      `SELECT segundos_tanda FROM franjas WHERE programa_id = (SELECT id FROM programas WHERE nombre = 'ENCENDIDOS') AND dia_semana = 1`,
    );
    expect(rows[0]!.segundos_tanda).toBe(999);
  });
});

describe('consultas (con el rol de la API)', () => {
  it('lista las emisoras', async () => {
    await b.comoApi();
    const e = await listarEmisoras(b.db);
    await b.comoDueno();
    expect(e.map((x) => x.slug)).toContain('caracas');
    expect(e).toHaveLength(10);
  });

  it('la parrilla de Caracas trae los nacionales y sus locales, no los de Mérida', async () => {
    await b.comoApi();
    const p = (await parrillaDeEmisora(b.db, 'caracas', { soloActivas: true }))!;
    await b.comoDueno();
    const nombres = p.programas.map((x) => x.nombre);
    expect(nombres).toEqual(expect.arrayContaining(['ENCENDIDOS', 'CONVOCADOS', 'AL AIRE', 'Máximo Volumen', 'Play House Líder']));
    expect(nombres).not.toContain('El Brunch');
    const playHouse = p.programas.find((x) => x.nombre === 'Play House Líder')!;
    expect(playHouse.franjas.map((f) => `${f.dia} ${f.inicio}-${f.fin}`)).toEqual(['5 21:00-24:00', '6 00:00-01:00', '6 21:00-24:00', '7 00:00-01:00']);
    expect(playHouse.franjas.every((f) => f.cupoConfirmado === false)).toBe(true);
  });

  it('una emisora sin programas locales igual tiene los nacionales', async () => {
    const p = (await parrillaDeEmisora(b.db, 'el-vigia'))!;
    expect(p.programas.map((x) => x.alcance)).toEqual(['nacional', 'nacional', 'nacional']);
    expect(p.emisora.frecuencia).toBe('100.1 FM');
  });

  it('una emisora que no existe da null', async () => {
    expect(await parrillaDeEmisora(b.db, 'atlantis')).toBeNull();
  });
});

describe('vitrina: señal en vivo y descripciones', () => {
  it('todas las emisoras traen su señal https y su descripción, y los programas la suya', async () => {
    await b.comoApi();
    const e = await listarEmisoras(b.db);
    const p = (await parrillaDeEmisora(b.db, 'caracas'))!;
    await b.comoDueno();
    expect(e.every((x) => x.streamUrl?.startsWith('https://') && x.descripcion)).toBe(true);
    expect(e.find((x) => x.slug === 'caracas')!.streamUrl).toBe('https://acp4.lorini.net:15020/stream');
    expect(p.programas.every((x) => x.descripcion)).toBe(true);
  });

  it('volver a cargar completa lo que falta pero respeta lo que el equipo cambió', async () => {
    await b.pg.query(`UPDATE emisoras SET descripcion = 'Texto del equipo', stream_url = NULL WHERE slug = 'valencia'`);
    await b.pg.query(`UPDATE programas SET descripcion = 'Corregida' WHERE nombre = 'ENCENDIDOS'`);
    await cargarParrilla(b.db, archivo);
    const { rows } = await b.pg.query<{ descripcion: string; stream_url: string }>(`SELECT descripcion, stream_url FROM emisoras WHERE slug = 'valencia'`);
    expect(rows[0]).toEqual({ descripcion: 'Texto del equipo', stream_url: 'https://acp4.lorini.net:15028/stream' });
    const { rows: pr } = await b.pg.query<{ descripcion: string }>(`SELECT descripcion FROM programas WHERE nombre = 'ENCENDIDOS'`);
    expect(pr[0]!.descripcion).toBe('Corregida');
  });

  it('rechaza una señal que no es https', () => {
    const malo = { ...archivo, emisoras: [{ ...archivo.emisoras[0]!, stream: 'http://inseguro.example/stream' }, ...archivo.emisoras.slice(1)] };
    expect(ArchivoParrilla.safeParse(malo).success).toBe(false);
  });
});
