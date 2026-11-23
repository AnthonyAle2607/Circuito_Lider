# Migraciones

Archivos `NNNN_nombre.sql`, aplicados en orden por `pnpm db:migrate` (runner en `packages/db/src/migrate.ts`).

- Una migración aplicada **no se edita nunca**: el runner compara su huella y se detiene. Se corrige con una nueva.
- Cada archivo corre en su propia transacción.
- Hechas (PT-1): `0001_identidad`, `0002_catalogo`, `0003_bitacora_y_outbox` (la bitácora y el outbox se adelantaron
  porque todo lo demás escribe en ellos).
- PT-2: `0004_parrilla_editable`. PT-3: `0005_inventario_y_precios` (tarifario, cotizaciones, pedidos, cupos, reservas).
- Panel del anunciante: `0006_panel_anunciante` (datos de la empresa, cambio de nombre y clave).
- Vitrina: `0007_vitrina` (señal en vivo y descripción de cada emisora).
- PT-6: `0008_anuncios` (spots subidos, su revisión automática y humana, palabras prohibidas).
- PT-7: `0009_grabacion_y_certificados` (bloques grabados de cada emisora, anuncio del pedido, certificados inmutables).
- PT-5: `0010_pagos` (pagos por pasarela y transferencia, avisos idempotentes, conciliación).
- Siguen: spots y revisión, programación, agente de ventas.
- Cada migración que añade tablas actualiza `packages/db/src/schema/` (un archivo por dominio) en el mismo cambio.
- Los roles `app_api` y `app_worker` los crea `0001` sin acceso; los permisos van en cada migración (`GRANT` mínimos).
