import { describe, expect, it } from 'vitest';
import type { Parrilla } from '@sp/schemas';
import { desdeCentimos, emisionesDe, indexar, paquetes, pasaFiltros, programasDe, type DatosVenta } from '../src/componentes/venta/datos';

/** Parrilla mínima: un programa en cadena (en las dos emisoras) y uno local por emisora. */
function parrilla(slug: string, ciudad: string, local: { nombre: string; dia: number; inicio: string }): Parrilla {
  const franja = (id: string, dia: number, inicio: string) => ({ id, dia, inicio, fin: '23:00', segundosTanda: 120, cupoConfirmado: true, activa: true });
  return {
    emisora: { id: slug, slug, nombre: `Líder ${ciudad}`, ciudad, frecuencia: '94.9 FM', streamUrl: null, descripcion: null },
    zonaHoraria: 'America/Caracas',
    programas: [
      { id: 'enc', nombre: 'ENCENDIDOS', alcance: 'nacional', locutores: null, descripcion: null, franjas: [franja('n-lun', 1, '06:00'), franja('n-mar', 2, '06:00')] },
      { id: `${slug}-l`, nombre: local.nombre, alcance: 'local', locutores: null, descripcion: 'Propio', franjas: [franja(`${slug}-f`, local.dia, local.inicio)] },
    ],
  };
}

const datos: DatosVenta = {
  emisoras: [],
  parrillas: {
    caracas: parrilla('caracas', 'Caracas', { nombre: 'Play House', dia: 6, inicio: '00:00' }),
    merida: parrilla('merida', 'Mérida', { nombre: 'El Brunch', dia: 3, inicio: '10:00' }),
  },
  tarifario: {
    duraciones: [30, 40],
    tarifas: [
      { alcance: 'nacional', precioCentimos: 6000 },
      { alcance: 'local', precioCentimos: 1500 },
      { alcance: 'local', precioCentimos: 1200 },
    ],
  } as unknown as DatosVenta['tarifario'],
};

describe('programas de la tienda', () => {
  it('el programa en cadena aparece una sola vez y va primero', () => {
    const p = programasDe(datos);
    expect(p.map((x) => x.nombre)).toEqual(['ENCENDIDOS', 'Play House', 'El Brunch']);
    expect(p[0]!.emisora).toBeNull();
    expect(p[1]!.ciudad).toBe('Caracas');
  });

  it('las franjas en cadena no quedan atadas a una emisora', () => {
    const f = indexar(datos);
    expect(f.get('n-lun')!.emisora).toBeNull();
    expect(f.get('merida-f')!.emisora).toBe('merida');
  });
});

describe('filtros', () => {
  const [cadena, nocturno, manana] = programasDe(datos) as [never, never, never];

  it('«en cadena» deja fuera los locales', () => {
    expect(pasaFiltros(cadena, { donde: 'cadena', cuando: 'cualquiera' })).toBe(true);
    expect(pasaFiltros(manana, { donde: 'cadena', cuando: 'cualquiera' })).toBe(false);
  });

  it('una ciudad muestra sus locales y la cadena', () => {
    expect(pasaFiltros(cadena, { donde: 'merida', cuando: 'cualquiera' })).toBe(true);
    expect(pasaFiltros(manana, { donde: 'merida', cuando: 'cualquiera' })).toBe(true);
    expect(pasaFiltros(nocturno, { donde: 'merida', cuando: 'cualquiera' })).toBe(false);
  });

  it('la madrugada cuenta como noche, no como mañana', () => {
    expect(pasaFiltros(nocturno, { donde: 'todo', cuando: 'mananas' })).toBe(false);
    expect(pasaFiltros(nocturno, { donde: 'todo', cuando: 'tardes' })).toBe(true);
    expect(pasaFiltros(manana, { donde: 'todo', cuando: 'mananas' })).toBe(true);
  });

  it('fin de semana: sábado y domingo', () => {
    expect(pasaFiltros(nocturno, { donde: 'todo', cuando: 'finde' })).toBe(true);
    expect(pasaFiltros(manana, { donde: 'todo', cuando: 'finde' })).toBe(false);
  });
});

describe('emisiones de la selección', () => {
  const franjas = indexar(datos);

  it('repite cada franja semana a semana desde el lunes elegido', () => {
    const e = emisionesDe(new Set(['n-lun', 'merida-f']), franjas, '2026-11-30', 2, '2026-11-23');
    expect(e.map((x) => `${x.franjaId}@${x.fecha}`)).toEqual(['n-lun@2026-11-30', 'n-lun@2026-12-07', 'merida-f@2026-12-02', 'merida-f@2026-12-09']);
  });

  it('no vende fechas de hoy ni pasadas', () => {
    const e = emisionesDe(new Set(['n-lun', 'n-mar']), franjas, '2026-11-23', 1, '2026-11-23');
    expect(e.map((x) => x.fecha)).toEqual(['2026-11-24']);
  });

  it('ignora ids que ya no están en la parrilla', () => {
    expect(emisionesDe(new Set(['no-existe']), franjas, '2026-11-30', 1, '2026-11-23')).toEqual([]);
  });
});

describe('precio «desde» y paquetes', () => {
  it('toma el precio más bajo del alcance', () => {
    expect(desdeCentimos(datos.tarifario, 'local')).toBe(1200);
    expect(desdeCentimos(datos.tarifario, 'nacional')).toBe(6000);
    expect(desdeCentimos(null, 'local')).toBeNull();
  });

  it('arma los paquetes con la parrilla real', () => {
    const [ciudad, region, nacional] = paquetes(indexar(datos));
    expect(ciudad!.ids).toEqual(['caracas-f']);
    expect(region!.ids.sort()).toEqual(['caracas-f', 'merida-f']);
    expect(region!.destacado).toBe(true);
    expect(nacional!.ids.sort()).toEqual(['n-lun', 'n-mar']);
  });
});
