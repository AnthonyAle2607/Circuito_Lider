/**
 * Nombre de la cookie HttpOnly con el token de la API. Vive aparte de `sesion.ts` (que es `server-only` y usa
 * `next/headers`) para que también lo pueda leer el middleware.
 */
export const COOKIE_SESION = 'sp_sesion';
