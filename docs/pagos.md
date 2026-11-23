# Pagos (PT-5)

Cómo se cobra un pedido reservado y cómo se garantiza que un pago se confirme una sola vez (P5) sin tocar datos de
tarjeta (P6). Decisión de arquitectura: D11 en el vault (pasarela con pago alojado y transferencia como alternativa).

## Dos caminos

| Camino | Quién confirma | Dónde |
|---|---|---|
| **Pasarela** (principal) | El aviso firmado de la pasarela, o la conciliación si el aviso se pierde | `POST /v1/pedidos/:id/pagar` → página alojada → `POST /v1/pagos/webhook/:proveedor` |
| **Transferencia** | Finanzas en el panel (`/pagos`), tras ver el comprobante | `POST /v1/pedidos/:id/comprobante` → `POST /v1/panel/pagos/:id/decision` |

## Garantías

- **Idempotencia (P5).** `resolver_pago()` guarda cada aviso en `webhook_eventos` con su id único *antes* de tocar
  nada. Un aviso repetido devuelve `duplicado` y no cambia nada. La conciliación usa el mismo camino con el id
  `conciliacion:<referencia>:<estado>`.
- **La API no cambia estados.** Solo crea el pago y anota la sesión; los estados de pagos, pedidos y reservas los
  cambian `resolver_pago()` y `decidir_transferencia()` (SECURITY DEFINER, migración `0010_pagos`).
- **Monto exacto.** Un aviso aprobado por otro monto o moneda no confirma: queda `monto_distinto` y se avisa a finanzas.
- **El dinero nunca se pierde.** Un cobro aprobado se registra siempre. Si el pedido ya venció, se canceló o ya estaba
  pagado (dos pestañas), el pago queda `aprobado` con el motivo y un evento `pago.tardio` para devolverlo.
- **Transferencias a tiempo.** Con un comprobante por revisar, el pedido no vence aunque pase la hora límite.
- **Firma.** HMAC-SHA256 de `t.cuerpo` con tolerancia de 5 min, comparada en tiempo constante (`@sp/payments`).

## Estados

`pagos.estado`: `pendiente` → `aprobado` | `rechazado` | `expirado`. Cuando un pago se aprueba, el pedido pasa a
`pagado`, sus reservas a `confirmada` y las demás sesiones abiertas del pedido a `expirado`.

## Pasarela de prueba

Mientras Invermedia elige proveedor (pregunta abierta 1), `PAGOS_PROVEEDOR=prueba` usa una pasarela que se comporta
como una real y no cobra: la página «alojada» vive en la API (`/v1/pasarela-prueba/:ref`), firma sus avisos con
`PAGOS_PRUEBA_SECRETO` y guarda sus sesiones en Redis (la API y la conciliación ven las mismas). No arranca con
`NODE_ENV=production`.

## Añadir el proveedor real

1. Un adaptador en `packages/payments/src/` que cumpla `Pasarela` (crear sesión, verificar aviso, consultar).
2. Su caso en `pasarelaDelEntorno()` con sus variables en `.env.example`.
3. Registrar en el proveedor la URL de avisos `https://<api>/v1/pagos/webhook/<nombre>`.
4. Probar con su modo de pruebas: aviso repetido, aviso perdido (conciliación), monto distinto, pago tardío.

Pendiente para cuando haya proveedor: reembolsos desde el panel (hoy `pago.tardio` avisa y finanzas devuelve a mano).
