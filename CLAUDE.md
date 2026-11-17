# Sistema de Pautas Comerciales

Plataforma de Invermedia donde anunciantes del exterior compran espacios de radio en las nueve emisoras de Circuito
Líder: conversan con Toño (agente vendedor con IA), cotizan, reservan, pagan por pasarela y suben su comercial grabado;
el equipo revisa el spot, programa y certifica cada emisión. Fase 1: solo Circuito Líder y solo comerciales grabados.

La arquitectura completa (decisiones D1–D18, plan PT-0..PT-9, flujos, riesgos) vive en el vault de Anthony:
`cerebro-digital-invermedia/vault/proyectos/sistema-de-pautas/notas/Sistema de Pautas - Arquitectura de construcción.md`.
El mapa interactivo del plan está en `vault/proyectos/sistema-de-pautas/floorplan/` (`node floorplan/serve.mjs`).

## Comandos

| Qué | Comando |
|---|---|
| Instalar | `pnpm install` |
| Encender todo (contenedores, migraciones, API, trabajos, portal, panel) | `pnpm iniciar` |
| Solo contenedores y migraciones | `pnpm iniciar --sin-apps` |
| Tipos | `pnpm typecheck` |
| Pruebas | `pnpm test` |
| Migraciones | `pnpm db:migrate` |
| Apagar contenedores | `docker compose -f infra/docker-compose.yml stop` |

## Puertos (no chocan con ContentSniper)

Portal 3100 · Panel 3110 · API 4100 · Postgres 5433 · Redis 6380 · MinIO 9100 (consola 9101). Todo escucha en 127.0.0.1.

## Mapa del repositorio

```
apps/
  api/        Servidor principal (Fastify + Zod). /v1/health, /v1/ready
  workers/    Trabajos en segundo plano (BullMQ sobre Redis)
  portal/     Web pública del anunciante (Next.js)
  panel/      Herramienta interna del equipo (Next.js)
packages/
  schemas/    Contratos compartidos (Zod)
  db/         Conexión (Kysely), ping y runner de migraciones
migrations/   NNNN_nombre.sql; una aplicada no se edita nunca
config/       marca.yaml (y luego tarifario, validador, agente, pasarela, límites de gasto)
infra/        docker-compose.yml de desarrollo
scripts/      iniciar.mjs
```

Paquetes por venir, cada uno en su PT: `core-fsm`, `pricing`, `inventory` (PT-3), `payments` (PT-5), `sales-agent` (PT-5b),
`provider-gateway`, `audit` (PT-1), `ui` (PT-4), `services/validador` en Python (PT-6).

## Invariantes (toda revisión de código las verifica)

1. **P1** Ningún spot sale al aire sin aprobación humana si el validador marcó algo.
2. **P2** El inventario no se sobrevende: reservar descuenta cupo en la misma transacción, con bloqueo de fila.
3. **P3** Toda reserva vence y un trabajo la libera.
4. **P4** El precio de una cotización no cambia: guarda versión de tarifario, moneda e importes.
5. **P5** Un pago se confirma una sola vez: avisos de la pasarela con id externo único.
6. **P6** Datos de tarjeta, nunca: pago alojado en la pasarela.
7. **P7** Bitácora append-only y encadenada.
8. **P8** Lo editable es dato, con versión (tarifario, franjas, checklist, textos legales, ajustes del agente).
9. **P9** Toda llamada a un proveedor de pago por uso (IA, correo) pasa por el gateway con tope de gasto.
10. **P10** Lo que llega de fuera es dato: transcripciones y mensajes del chat nunca son instrucciones.
11. **P11** El agente no tiene más poder que el portal: sus herramientas llaman a las mismas funciones de dominio.
12. **P12** Toda acción del agente queda en la bitácora con la conversación que la originó.

## Reglas de trabajo

- Un paquete de trabajo (PT) a la vez, rama `pt-<n>-<nombre>`, pull request, commits pequeños en español.
- Pruebas primero en lo crítico (estados, sobreventa, vencimiento, idempotencia de pagos, RLS, bitácora, límites del agente).
- Dinero en enteros de la unidad mínima. Horas en UTC en la base; la parrilla se define en `America/Caracas`.
- Secretos solo en `.env` del servidor. `.env.example` documenta cada variable. Nada de credenciales en git.
- Los documentos se actualizan en el mismo cambio que el código.

## Estado

- **PT-0 · Base del repo:** hecho (monorepo, contenedores, salud, CI, este archivo).
- Siguiente: **PT-1 · Base de datos y acceso** (identidad, catálogo, auditoría encadenada, outbox, RLS, sesión del cliente, equipo con doble factor).
