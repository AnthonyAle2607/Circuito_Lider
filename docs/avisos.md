# Avisos (outbox → n8n)

La API y los trabajos no mandan correos: dejan un **evento** en la tabla `outbox`, en la misma transacción del cambio
que lo origina (si el cambio se revierte, el evento también). El trabajo `despachar-avisos` (cada 15 s) los entrega a
**n8n**, que decide qué correo o mensaje sale. Así un fallo de correo nunca rompe una venta, y nada se pierde: lo que no
se entrega se reintenta.

## Entrega

`POST AVISOS_URL` con este cuerpo JSON:

```json
{
  "id": 1234,
  "tipo": "pedido.pagado",
  "anuncianteId": "uuid o null",
  "contacto": { "email": "ana@cafe.com", "nombre": "Ana", "empresa": "Café Andino", "pais": "US" },
  "datos": { "pedido_id": "…", "pago_id": "…" },
  "creadoAt": "2026-11-23T18:00:00.000Z"
}
```

- `contacto` es el primer usuario del anunciante (null en eventos sin anunciante, como los internos de ventas).
- Cabecera `x-pautas-evento`: el `tipo`, para enrutar sin leer el cuerpo.
- Cabecera `x-pautas-firma`: `t=<segundos>,v1=<hex>`, con `v1 = HMAC-SHA256(AVISOS_SECRETO, "<t>.<cuerpo crudo>")`. n8n debe
  recalcularla sobre el cuerpo **sin parsear**, compararla y descartar si `t` tiene más de 5 minutos.
- Respuesta 2xx = entregado. Cualquier otra cosa (o sin respuesta en 10 s) = reintento con espera de 1, 2, 4… minutos
  hasta 6 horas; a los 10 intentos queda parado con `ultimo_error` en la tabla para revisarlo.
- **Idempotencia:** un mismo `id` puede llegar dos veces (si n8n respondió tarde). n8n debe ignorar un `id` que ya
  procesó.

## Eventos y qué aviso corresponde

| `tipo` | Origen | Aviso sugerido | Datos |
|---|---|---|---|
| `cuenta.registrada` | Registro | Correo al cliente con el enlace para confirmar su correo (vence en 48 h) | `email`, `nombre`, `enlace` |
| `cuenta.recuperar_clave` | Recuperar clave | Correo al cliente con el enlace para crear clave nueva (vence en 1 h) | `email`, `nombre`, `enlace` |
| `cuenta.clave_cambiada` | Clave restablecida | Correo al cliente: «tu clave cambió; si no fuiste tú, escríbenos» | `usuario_id` |
| `cotizacion.en_aprobacion` | Cotización sobre el umbral | Aviso interno a ventas | `cotizacion_id` |
| `pedido.reservado` | Reserva | Correo al cliente con el enlace para pagar y la hora límite | `pedido_id` |
| `pedido.pagado` | Pago confirmado | Correo al cliente (recibo) y aviso interno a programación | `pedido_id`, `pago_id` |
| `pedido.cancelado` / `pedido.vencido` | Cancelación / vencimiento | Correo al cliente | `pedido_id` |
| `pago.comprobante` | Transferencia enviada | Aviso interno a finanzas | `pago_id`, `pedido_id` |
| `pago.rechazado` | Finanzas rechazó la transferencia | Correo al cliente con el motivo | `pago_id`, `pedido_id` |
| `pago.revisar` | Monto distinto en la pasarela | Aviso interno urgente a finanzas | `pago_id`, `monto`, `moneda` |
| `pago.tardio` | Cobro con el pedido inactivo o ya pagado | Aviso interno a finanzas: devolver el dinero | `pago_id`, `pedido_id` |
| `anuncio.revisado` | Revisión del spot | Correo al cliente: aprobado, o qué cambiar | `anuncio_id`, `estado` |
| `emision.certificada` | Detección de una emisión | Opcional: resumen diario al cliente | `certificado_id` |
| `orden.creada` | Pedido pagado con spot aprobado | Aviso interno a programación (una por emisora) | `orden_id`, `pedido_id`, `emisora_id` |
| `orden.cargada` | Programación confirmó la carga | Opcional: al cliente cuando todas sus órdenes están cargadas | `orden_id`, `pedido_id` |
| `agente.traspaso` | Toño pasó la conversación | Aviso interno a ventas con el enlace al panel | `conversacion_id`, `motivo` |

Los enlaces (`enlace`) llevan códigos de un solo uso: n8n no debe guardarlos en sus registros más de lo necesario.

## Encenderlo

En `.env` del servidor: `AVISOS_URL` (el webhook de n8n) y `AVISOS_SECRETO` (32+ caracteres, el mismo en n8n). Sin
`AVISOS_URL` los eventos esperan en el outbox; al configurarla, salen los pendientes. En desarrollo,
`AVISOS_EN_CONSOLA=1` escribe en el registro de la API los enlaces de verificación y de clave nueva.
