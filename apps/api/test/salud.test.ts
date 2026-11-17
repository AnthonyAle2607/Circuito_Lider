import { describe, expect, it } from 'vitest';
import { Preparado, Salud } from '@sp/schemas';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const bien = async () => {};
const mal = async () => {
  throw new Error('conexión rechazada');
};

describe('salud', () => {
  it('GET /v1/health responde siempre que el proceso viva', async () => {
    const app = await buildApp({ comprobaciones: { base: mal } });
    const r = await app.inject('/v1/health');
    expect(r.statusCode).toBe(200);
    expect(Salud.parse(r.json()).servicio).toBe('api');
  });

  it('GET /v1/ready da 200 cuando todo responde', async () => {
    const app = await buildApp({ comprobaciones: { base: bien, colas: bien } });
    const r = await app.inject('/v1/ready');
    expect(r.statusCode).toBe(200);
    expect(Preparado.parse(r.json())).toEqual({ ok: true, dependencias: { base: 'ok', colas: 'ok' } });
  });

  it('GET /v1/ready da 503 y nombra la dependencia caída, sin el error interno', async () => {
    const app = await buildApp({ comprobaciones: { base: bien, colas: mal } });
    const r = await app.inject('/v1/ready');
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ ok: false, dependencias: { base: 'ok', colas: 'caida' } });
    expect(r.body).not.toContain('rechazada');
  });

  it('manda cabeceras de seguridad', async () => {
    const app = await buildApp({ comprobaciones: {} });
    const r = await app.inject('/v1/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('configuración', () => {
  it('se detiene con un mensaje claro si falta algo', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('usa el puerto 4100 por defecto', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5433/pautas', REDIS_URL: 'redis://localhost:6380' });
    expect(c.port).toBe(4100);
  });
});
