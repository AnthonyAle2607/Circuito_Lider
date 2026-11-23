# @sp/payments

Pagos (PT-5): la interfaz `Pasarela` que cumple cada proveedor, la firma de los avisos (`firmar`, `verificarFirma`),
la pasarela de prueba (`pasarelaDePrueba`), la elección por entorno (`pasarelaDelEntorno`) y la lectura de
`config/pagos.yaml` (`leerConfigPagos`). La usan la API (rutas de pago) y los trabajos (conciliación).

Flujo completo, garantías y cómo añadir el proveedor real: [docs/pagos.md](../../docs/pagos.md).
