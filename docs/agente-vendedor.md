# Agente vendedor (PT-5b)

Toño, el chat del portal, conversa con Claude para vender: entiende qué quiere anunciar el cliente, recomienda programas,
cotiza con el tarifario vigente y le da el enlace donde reserva y paga. Lo que no puede resolver lo pasa al equipo de
ventas. Meta (D16): que 8 de cada 10 ventas pagadas las cierre sin ayuda. Decisiones: D16–D18 en el vault.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Bucle y herramientas | `packages/sales-agent` | Un turno: llama al modelo en streaming, ejecuta herramientas, mide el gasto. No conoce la base: recibe un `Dominio`. |
| Dominio del agente | `apps/api/src/agente/dominio.ts` | Las mismas funciones que usan las rutas del portal (P11), p. ej. `crearCotizacion`. |
| Conversaciones | migración `0011_agente_ventas`, `apps/api/src/agente/conversaciones.ts` | Mensajes guardados tal cual (append-only), contadores, gasto diario, traspaso. |
| Chat | `POST /v1/agente/mensajes` (SSE) → portal `/api/agente` → `componentes/animacion/tono-agente.ts` | Respuesta en vivo. Sin credenciales, Toño usa sus respuestas fijas. |
| Bandeja | `GET /v1/panel/agente/conversaciones`, panel `/conversaciones` | Ventas ve los traspasos primero, la transcripción y la meta del 80 %. |
| Banco de pruebas | `packages/sales-agent/evals/` | Casos con guion y verificaciones sin juicio. Cuesta dinero: correr con aprobación. |

## Modelo y API

- **Claude Opus 5.5** (`claude-opus-5-5`) por el SDK oficial `@anthropic-ai/sdk`, con **esfuerzo bajo** (chat). El pensamiento
  es adaptativo y no se apaga en este modelo.
- **Bucle manual** (no el Tool Runner): guarda cada mensaje exactamente como se envió y recibió, transmite el texto al
  chat y corta por gasto en cada vuelta.
- **Caché:** instrucciones y herramientas fijas y en orden fijo, con punto de caché; la conversación se cachea con el
  `cache_control` de nivel superior. Lo que cambia (fecha, si hay sesión) va como mensaje de sistema dentro de la
  conversación, así no rompe la caché de las instrucciones.
- **Rechazos:** `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`) reintenta en el servidor con un modelo de
  respaldo; si todo declina, el cliente recibe una despedida amable y la conversación pasa a ventas.
- Herramientas con `strict: true`; cada entrada se valida otra vez con Zod antes de ejecutarse.

## Límites en código (D18) y gasto (P9)

- El agente **no puede dar descuentos**: no existe herramienta para eso; el único descuento es el automático del tarifario.
- Una cotización que pasa el umbral de aprobación queda «en aprobación» como en el portal: la aprueba ventas.
- Máximo de emisiones por cotización y de cotizaciones por conversación (`LIMITES` en `herramientas.ts`).
- **No reserva en el chat:** el enlace lleva a la cotización, donde el cliente acepta los términos, reserva y paga. La
  aceptación de los términos queda hecha por el cliente, no por el modelo.
- Topes de gasto por turno, por conversación y por día, y de mensajes por conversación: `config/agente.yaml`. Al
  pasarlos, el cliente recibe un mensaje amable y la conversación pasa a ventas.
- Cada cotización del agente guarda su `conversacion_id` y queda en la bitácora como acción del agente (P12).

## Encenderlo

Poner `ANTHROPIC_API_KEY` en `.env` y reiniciar la API. Sin clave, `POST /v1/agente/mensajes` responde
`agente_apagado` y Toño usa el guion fijo de `tono-respuestas.ts`.

## Pendiente

- Que ventas responda dentro del mismo chat y lo devuelva al agente (hoy ve la conversación y contacta por su cuenta).
- Seguimiento automático de prospectos que se fueron sin pagar, y WhatsApp/correo como otros canales.
- Correr el banco de pruebas con la clave real y ajustar instrucciones o esfuerzo con sus resultados.
- Preguntas abiertas 14–17 (topes de descuento, idiomas, horario de traspasos, medida del 80 %): hoy se usan los
  valores de arriba (sin descuentos, español e inglés, sin horario, pedidos pagados).
