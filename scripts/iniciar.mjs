#!/usr/bin/env node
// Enciende el Sistema de Pautas para desarrollar, en Windows, macOS o Linux:
//   1. crea .env desde .env.example si falta (valores solo de desarrollo)
//   2. levanta Postgres, Redis y MinIO (docker compose) y espera a que estén sanos
//   3. aplica las migraciones
//   4. enciende API, trabajos, portal y panel, espera a que respondan y muestra las direcciones
// Uso:  pnpm iniciar [--sin-apps]   (--sin-apps: solo base, colas y almacén)
// Ctrl-C lo apaga todo (los contenedores siguen arriba; se apagan con: docker compose -f infra/docker-compose.yml stop).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(RAIZ);
const SIN_APPS = process.argv.includes('--sin-apps');
const COMPOSE = ['compose', '-f', 'infra/docker-compose.yml'];
const SERVICIOS = [
  { nombre: 'API', url: 'http://127.0.0.1:4100/v1/ready' },
  { nombre: 'Portal', url: 'http://127.0.0.1:3100' },
  { nombre: 'Panel', url: 'http://127.0.0.1:3110' },
];

const fallar = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const correr = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status === 0;

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Creé .env a partir de .env.example (valores de desarrollo).');
}

if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) fallar('Docker no está encendido. Ábrelo y vuelve a intentar.');
console.log('Levantando Postgres, Redis y MinIO…');
if (!correr('docker', [...COMPOSE, 'up', '-d', '--wait', 'postgres', 'redis', 'minio'])) fallar('No levantaron los contenedores.');
if (!correr('pnpm', ['db:migrate'])) fallar('Fallaron las migraciones (pnpm db:migrate).');

// Solo desarrollo: las migraciones crean los roles de la aplicación sin acceso; aquí se les da la clave de .env.example.
// En producción las claves las pone el runbook del servidor y este paso no corre.
const claves = "ALTER ROLE app_api WITH LOGIN PASSWORD 'app_api_dev'; ALTER ROLE app_worker WITH LOGIN PASSWORD 'app_worker_dev';";
if (spawnSync('docker', [...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-q', '-U', 'postgres', '-d', 'pautas', '-c', claves], { stdio: 'ignore' }).status !== 0) {
  fallar('No pude dejar listos los roles app_api y app_worker.');
}
// La parrilla de Circuito Líder: solo añade lo que falta, nunca pisa lo corregido en el panel.
if (!correr('pnpm', ['cargar-parrilla'])) fallar('No se pudo cargar la parrilla (pnpm cargar-parrilla).');
// Tarifario de EJEMPLO, solo si la base no tiene ninguno (los precios reales se publican desde el panel).
if (!correr('pnpm', ['cargar-tarifario-ejemplo'])) fallar('No se pudo cargar el tarifario de ejemplo.');
if (!correr('pnpm', ['cargar-palabras'])) fallar('No se pudo cargar la lista de palabras prohibidas.');
if (SIN_APPS) {
  console.log('✔ Base, colas y almacén listos.');
  process.exit(0);
}

const filtros = ['@sp/api', '@sp/workers', '@sp/portal', '@sp/panel'].map((f) => `--filter=${f}`);
const apps = spawn('pnpm', ['turbo', 'run', 'dev', '--parallel', ...filtros], { stdio: 'inherit', shell: process.platform === 'win32' });
apps.on('exit', (code) => process.exit(code ?? 0));
const apagar = () => {
  apps.kill('SIGINT');
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

async function esperar({ nombre, url }, segundos) {
  for (let i = 0; i < segundos; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  console.error(`✖ ${nombre} no respondió en ${segundos} s (${url}). Revisa los mensajes de arriba.`);
  return false;
}

const listos = await Promise.all(SERVICIOS.map((s) => esperar(s, 180)));
if (listos.every(Boolean)) {
  console.log('\n✔ Sistema de Pautas listo');
  console.log('  Portal:  http://localhost:3100');
  console.log('  Panel:   http://localhost:3110');
  console.log('  API:     http://127.0.0.1:4100/v1/health');
  console.log('  MinIO:   http://127.0.0.1:9101 (consola del almacén)');
  console.log('  Ctrl-C lo apaga todo.\n');
}
