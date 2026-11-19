import { defineConfig } from 'vitest/config';

// Arrancar PGlite (Postgres en memoria) y migrar tarda segundos en las máquinas de la CI: más margen que los 5 s por defecto.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
