/**
 * Pagos (PT-5): la interfaz que cumple cada pasarela, la firma de los avisos y la pasarela de prueba. Las rutas de la
 * API y la conciliación de los trabajos solo dependen de `Pasarela`.
 */
export { AvisoInvalido, type Aviso, type EstadoExterno, type Pasarela, type PedirSesion, type Sesion } from './tipos';
export { TOLERANCIA_S, firmar, verificarFirma } from './firma';
export { CABECERA_FIRMA, almacenEnMemoria, pasarelaDePrueba, type Almacen, type PasarelaDePrueba, type SesionDePrueba } from './prueba';
export { leerConfigPagos, type ConfigPagos } from './config';
export { pasarelaDelEntorno } from './entorno';
