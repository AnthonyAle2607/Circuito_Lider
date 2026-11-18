# Sistema de Pautas Comerciales

Plataforma de Invermedia donde anunciantes del exterior compran espacios de radio en las diez emisoras de Circuito
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
| Compilar el portal sin pisar el `next dev` | `NEXT_DIST_DIR=.next-prueba pnpm --filter @sp/portal exec next build` |
| Migraciones | `pnpm db:migrate` |
| Cargar o completar la parrilla de Circuito Líder (no pisa lo corregido en el panel) | `pnpm cargar-parrilla` |
| Cargar el tarifario de EJEMPLO (solo si no hay ninguno) | `pnpm cargar-tarifario-ejemplo` |
| Prueba de concurrencia del inventario contra Postgres real | `PRUEBAS_PG_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres pnpm --filter @sp/inventory exec vitest run test/concurrencia.pg.test.ts` |
| Alta de alguien del equipo (imprime clave inicial y enlace del doble factor una sola vez) | `pnpm --filter @sp/api crear-miembro-equipo --email x@invermedia.com --nombre "X" --roles ventas,revisor` |
| Verificar la bitácora | `select * from bitacora_verificar();` (filas revisadas, primera rota o vacío) |
| Apagar contenedores | `docker compose -f infra/docker-compose.yml stop` |

## Acceso a la base

- **Dueño / migrador** (`DATABASE_URL_MIGRATOR`): aplica migraciones y da de alta al equipo. La API nunca lo usa.
- **`app_api`** (`DATABASE_URL`): sin privilegios, sujeto a la RLS. Todo dato de un anunciante se consulta dentro de
  `withTenant(db, anuncianteId, fn)`; fuera de ahí la RLS no deja ver nada. Lo que ocurre antes de saber quién es el
  anunciante (ingreso por correo, verificación por código) va por funciones `SECURITY DEFINER` acotadas.
- **`app_worker`** (`DATABASE_URL_WORKER`): trabajos en segundo plano; añade a la bitácora, lee el outbox y corre
  `liberar_reservas_vencidas()`.
- Dinero: `bigint` en centavos, llega como `number`. Fechas: `date` llega como texto `AAAA-MM-DD` (ver `PARSERS` en `@sp/db`).
- Las migraciones crean los roles sin acceso; `pnpm iniciar` les pone la clave de desarrollo.
- Pruebas: `@sp/db/testing` da una base PGlite migrada; `comoApi()` cambia al rol real para que la RLS y los permisos se prueben de verdad.
- Los arreglos de enums (`rol_equipo[]`) llegan como texto desde el driver: selecciónalos con `rolesEquipo` de `@sp/db`.

## Sesiones

Token opaco `Authorization: Bearer` (se guarda solo su hash). El portal y el panel lo guardan del lado del servidor en
su propia cookie HttpOnly y llaman a la API desde el servidor. Anunciante: 12 h sin uso o 7 días. Equipo: clave + código
TOTP obligatorio, 8 h sin uso o 12 h; un código no se puede reutilizar.

## Puertos (no chocan con ContentSniper)

Portal 3100 · Panel 3110 · API 4100 · Postgres 5433 · Redis 6380 · MinIO 9100 (consola 9101). Todo escucha en 127.0.0.1.

## Mapa del repositorio

```
apps/
  api/        Servidor principal (Fastify + Zod). Salud, cuentas del anunciante, sesión del equipo
  workers/    Trabajos en segundo plano (BullMQ sobre Redis)
  portal/     Web pública del anunciante (Next.js)
  panel/      Herramienta interna del equipo (Next.js)
packages/
  schemas/    Contratos compartidos (Zod)
  db/         Conexión (Kysely), tipos de tablas, withTenant, runner de migraciones, base de prueba (PGlite)
  audit/      Bitácora encadenada: registrar() dentro de la transacción y verificar()
  catalogo/   Parrilla y tarifario: datos/*.yaml, carga idempotente, consultas, publicar tarifario
  core-fsm/   Estados del pedido y de la cotización con guardas
  pricing/    Cálculo puro de precios (centavos, descuento por volumen, umbral de aprobación)
  inventory/  Cupos: tomar (UPDATE condicionado con bloqueo), devolver, segundos libres; fechas de Caracas
datos/        circuito-lider.yaml (parrilla publicada) y tarifario-ejemplo.yaml (precios de EJEMPLO)
migrations/   NNNN_nombre.sql; una aplicada no se edita nunca
config/       marca.yaml (y luego tarifario, validador, agente, pasarela, límites de gasto)
infra/        docker-compose.yml de desarrollo
scripts/      iniciar.mjs
```

Paquetes por venir, cada uno en su PT: `payments` (PT-5), `sales-agent` (PT-5b),
`provider-gateway`, `ui` (PT-4), `services/validador` en Python (PT-6). El despachador del outbox llega con el primer
evento que tenga quien lo consuma (el correo de verificación, con n8n).

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
- **PT-1 · Base de datos y acceso:** hecho. Migraciones 0001 identidad, 0002 catálogo, 0003 bitácora y outbox; RLS por
  anunciante; registro, verificación de correo, ingreso y salida del anunciante; ingreso del equipo con doble factor.
  Pendiente para cuando haya correo: el despachador del outbox que envía el enlace de verificación.
- **PT-2 · Catálogo y parrilla:** hecho. Migración 0004 (slug, locutores, cupo confirmado, claves naturales); carga de
  las 9 emisoras, 13 programas y 51 franjas (Margarita 97.3 se añadió el 2026-11-18: 10 emisoras, sin programas locales publicados); `GET /v1/emisoras`, `GET /v1/parrilla`; panel con ingreso en dos pasos y
  edición de franjas (`/v1/panel/franjas`), cada cambio en la bitácora; portal `/parrilla`. Los segundos de tanda son
  estimados (240 s por hora) hasta que Circuito Líder los confirme.
- **PT-3 · Inventario y precios:** hecho. Migración 0005; tarifario versionado e inmutable (P4) con uno de EJEMPLO;
  `GET /v1/disponibilidad`, `POST /v1/cotizaciones`, `GET /v1/cotizaciones/:id`, `POST /v1/cotizaciones/:id/reservar`,
  `GET /v1/pedidos`, `GET /v1/pedidos/:id`, `POST /v1/pedidos/:id/cancelar`; panel: aprobaciones y `PUT /v1/panel/tarifario`.
  Reservar toma el cupo con un UPDATE condicionado: 50 reservas simultáneas sobre el último cupo, gana una (probado en
  Postgres real, también en la CI). El trabajo `liberar-reservas` vence cada minuto los pedidos sin pagar (P3).
- **PT-4 · Portal del cliente:** hecho con el diseño **Parrilla · Invermedia** (elegido el 2026-11-17). La decoración de
  la maqueta se conserva tal cual (`componentes/marcado.ts` + `componentes/efectos-diseno.ts`, apagable al salir de la
  página); paquetes y cotizador son React sobre la parrilla y el tarifario reales (`componentes/Venta.tsx`, con
  `GET /v1/tarifario` y `@sp/pricing` para el precio en vivo; el que vale lo calcula la API). Cuenta: registro,
  confirmación de correo con botón, ingreso, reserva con términos, mis pedidos, detalle y cancelación. Sesión del
  anunciante en cookie HttpOnly `sp_sesion`; las llamadas a la API van desde el servidor del portal (acciones).
  Probado de punta a punta con un usuario nuevo en el navegador.
- Siguiente: **PT-5 · Pagos** (pasarela con pago alojado, transferencia, conciliación) y **PT-5b · Agente vendedor**.
