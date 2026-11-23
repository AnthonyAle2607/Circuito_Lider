import { pasarelaDePrueba, type Almacen } from './prueba';
import type { Pasarela } from './tipos';

/**
 * La pasarela que indica el entorno (la usan la API y la conciliación de los trabajos, así ven la misma).
 * PAGOS_PROVEEDOR=prueba (único por ahora): no cobra y nunca corre en producción. Cuando Invermedia elija proveedor
 * (pregunta abierta 1) se añade aquí su adaptador con sus propias variables.
 */
export function pasarelaDelEntorno(env: NodeJS.ProcessEnv, almacen: Almacen): Pasarela {
  const proveedor = env.PAGOS_PROVEEDOR ?? 'prueba';
  if (proveedor !== 'prueba') throw new Error(`PAGOS_PROVEEDOR=${proveedor} no está disponible todavía (solo «prueba»).`);
  if (env.NODE_ENV === 'production') throw new Error('La pasarela de prueba no cobra: no se puede usar en producción.');
  const secreto = env.PAGOS_PRUEBA_SECRETO;
  if (!secreto || secreto.length < 32) throw new Error('Falta PAGOS_PRUEBA_SECRETO (32 caracteres o más) en .env.');
  const base = (env.API_URL_PUBLICA ?? 'http://localhost:4100').replace(/\/$/, '');
  return pasarelaDePrueba({ secreto, almacen, urlPagina: (r) => `${base}/v1/pasarela-prueba/${r}` });
}
