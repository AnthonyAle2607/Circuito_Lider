/**
 * Agente vendedor (PT-5b): Toño con Claude por la API oficial. Las herramientas llaman al dominio que le pasa la API
 * (P11); los límites viven en código (D18); el gasto se mide por turno (P9). Ver docs/agente-vendedor.md.
 */
export { MODELO, atender, type Evento, type Final, type OpcionesTurno, type Turno } from './conversacion';
export { TARIFA_MICRO_USD_POR_TOKEN, costoMicroUsd, type Uso } from './costo';
export type { Alcance, Dominio, EmisoraResumen, Libre, ProgramaDeParrilla, ResultadoCotizacion, Tarifas } from './dominio';
export { DEFINICIONES, LIMITES, ejecutar, type Efectos, type Prospecto } from './herramientas';
export { INSTRUCCIONES, VERSION_INSTRUCCIONES } from './instrucciones';
export { leerConfigAgente, type ConfigAgente } from './config';
