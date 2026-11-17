# Migraciones

Archivos `NNNN_nombre.sql`, aplicados en orden por `pnpm db:migrate` (runner en `packages/db/src/migrate.ts`).

- Una migración aplicada **no se edita nunca**: el runner compara su huella y se detiene. Se corrige con una nueva.
- Cada archivo corre en su propia transacción.
- Hechas (PT-1): `0001_identidad`, `0002_catalogo`, `0003_bitacora_y_outbox` (la bitácora y el outbox se adelantaron
  porque todo lo demás escribe en ellos).
- Siguen: inventario y precios, pedidos y pagos, spots y revisión, programación, agente de ventas.
- Cada migración que añade tablas actualiza `packages/db/src/schema.ts` en el mismo cambio.
- Los roles `app_api` y `app_worker` los crea `0001` sin acceso; los permisos van en cada migración (`GRANT` mínimos).
