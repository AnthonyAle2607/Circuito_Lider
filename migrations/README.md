# Migraciones

Archivos `NNNN_nombre.sql`, aplicados en orden por `pnpm db:migrate` (runner en `packages/db/src/migrate.ts`).

- Una migración aplicada **no se edita nunca**: el runner compara su huella y se detiene. Se corrige con una nueva.
- Cada archivo corre en su propia transacción.
- Plan: `0001_identidad`, `0002_catalogo`, `0003_inventario_y_precios`, `0004_pedidos_y_pagos`,
  `0005_spots_y_revision`, `0006_programacion`, `0007_auditoria_y_outbox`, `0008_agente_de_ventas`.
- Las primeras llegan en PT-1.
