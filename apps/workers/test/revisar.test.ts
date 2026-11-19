import { describe, expect, it } from 'vitest';
import { revisarAnuncios } from '../src/colas';

/** Base falsa: dos anuncios pendientes; registra lo que el trabajo guarda. */
function base(pendientes: Array<Record<string, unknown>>) {
  const guardados: unknown[][] = [];
  return {
    guardados,
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('palabras_prohibidas')) return { rows: [{ palabra: 'mierda' }] };
      if (sql.includes('tomar_anuncio_pendiente')) return { rows: pendientes.length ? [pendientes.shift()!] : [] };
      if (sql.includes('resolver_anuncio')) guardados.push(params!);
      return { rows: [] };
    },
  };
}

describe('revisar anuncios', () => {
  it('revisa cada pendiente con la lista vigente y guarda el resultado', async () => {
    const db = base([
      { id: 'a1', archivo_clave: 'k1', formato: 'mp3', intentos: 1 },
      { id: 'a2', archivo_clave: 'k2', formato: 'wav', intentos: 1 },
    ]);
    const vistos: string[] = [];
    const n = await revisarAnuncios(db, async (spot, prohibidas) => {
      vistos.push(`${spot.clave}:${prohibidas.join(',')}`);
      return { estado: 'aprobado', motivo: null, duracionMs: 30_000, transcripcion: 'hola', coincidencias: [] };
    });
    expect(n).toBe(2);
    expect(vistos).toEqual(['k1:mierda', 'k2:mierda']);
    expect(db.guardados.map((g) => [g[0], g[1], g[3]])).toEqual([
      ['a1', 'aprobado', 30_000],
      ['a2', 'aprobado', 30_000],
    ]);
  });

  it('si uno falla no guarda nada de él (queda para reintentar) y sigue con el resto', async () => {
    const db = base([
      { id: 'malo', archivo_clave: 'k1', formato: 'mp3', intentos: 1 },
      { id: 'bueno', archivo_clave: 'k2', formato: 'mp3', intentos: 1 },
    ]);
    const n = await revisarAnuncios(db, async (spot) => {
      if (spot.clave === 'k1') throw new Error('MinIO no responde');
      return { estado: 'en_revision', motivo: 'x', duracionMs: 1, transcripcion: null, coincidencias: [] };
    });
    expect(n).toBe(1);
    expect(db.guardados.map((g) => g[0])).toEqual(['bueno']);
  });
});
