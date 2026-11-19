/** Países de origen más probables primero; se acepta cualquier código ISO de dos letras. */
export const PAISES: Array<[string, string]> = [
  ['US', 'Estados Unidos'],
  ['ES', 'España'],
  ['CO', 'Colombia'],
  ['PA', 'Panamá'],
  ['MX', 'México'],
  ['CL', 'Chile'],
  ['PE', 'Perú'],
  ['AR', 'Argentina'],
  ['DO', 'República Dominicana'],
  ['VE', 'Venezuela'],
  ['IT', 'Italia'],
  ['PT', 'Portugal'],
  ['CA', 'Canadá'],
];

/** Zonas horarias que más se esperan entre los anunciantes; la del anunciante se agrega si no está en la lista. */
export const ZONAS: Array<[string, string]> = [
  ['America/Caracas', 'Venezuela (Caracas)'],
  ['America/New_York', 'EE. UU. Este (Nueva York, Miami)'],
  ['America/Chicago', 'EE. UU. Centro (Chicago, Houston)'],
  ['America/Denver', 'EE. UU. Montaña (Denver)'],
  ['America/Los_Angeles', 'EE. UU. Pacífico (Los Ángeles)'],
  ['America/Bogota', 'Colombia, Perú, Panamá'],
  ['America/Mexico_City', 'México (Ciudad de México)'],
  ['America/Santo_Domingo', 'República Dominicana'],
  ['America/Santiago', 'Chile'],
  ['America/Argentina/Buenos_Aires', 'Argentina'],
  ['America/Toronto', 'Canadá Este (Toronto)'],
  ['Europe/Madrid', 'España, Italia'],
  ['Europe/Lisbon', 'Portugal'],
];
