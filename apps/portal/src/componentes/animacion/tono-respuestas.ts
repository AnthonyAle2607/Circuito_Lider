/**
 * Guion de Toño, el chat de soporte de la portada. Respuestas fijas por palabras clave mientras llega el agente de
 * ventas. Es HTML propio (no viene del usuario), por eso puede llevar enlaces y negritas.
 */
export const RESPUESTAS = {
  comprar:
    'Es así: <b>1)</b> eliges emisoras y horas, <b>2)</b> subes tu spot de 30 o 40 s, <b>3)</b> una persona lo revisa y pagas en línea, <b>4)</b> recibes la prueba de cada emisión. <a href="#como">Ver los pasos</a>',
  precios:
    'El precio sale al instante en el <a href="#cotizar">cotizador</a>: eliges emisoras, horas y semanas y ves el total. Los <a href="#paquetes">paquetes</a> son un buen punto de partida.',
  exterior: '¡Sí! La plataforma está pensada para anunciantes fuera de Venezuela. Los medios de pago y las monedas se confirman antes del lanzamiento.',
  emisoras:
    'Son 10 emisoras de Circuito Líder: Caracas 94.9, Valencia 106.7, Maracaibo 100.5, Barquisimeto 94.9, Mérida 92.3, San Cristóbal 91.1, El Vigía 100.1, Puerto Ordaz 100.3, Puerto La Cruz 100.5 y Margarita 97.3.',
  certificado: 'Cada emisión aparece en tu panel con hora y emisora, y al cerrar la campaña te llega el certificado de transmisión. 📄',
  normativa: 'Una persona escucha tu spot y lo revisa según la normativa de CONATEL. Si algo no cumple, te decimos qué cambiar antes de programarlo.',
  formatos: 'Hoy vendemos comerciales grabados de 30 o 40 segundos. La mención en vivo del locutor y el patrocinio de programas llegan después.',
  persona:
    'Te paso con el equipo de ventas 🙌. Te escriben por correo o WhatsApp para armar la pauta contigo. <i>(Los datos de contacto se definen antes del lanzamiento.)</i>',
  hola: '¡Hola! 👋 Soy Toño. Pregúntame cómo comprar, precios, emisoras o el certificado.',
  gracias: '¡Con gusto! Si necesitas algo más, aquí estoy. 📻',
} as const;

export type Tema = keyof typeof RESPUESTAS;

/** Palabras clave → tema. Gana la primera regla que coincide. */
export const REGLAS: Array<[RegExp, Tema]> = [
  [/precio|cuesta|tarifa|cu[aá]nto|costo|paquete/i, 'precios'],
  [/compr|c[oó]mo funciona|pasos|empez|contratar/i, 'comprar'],
  [/exterior|fuera|pa[ií]s|miami|espa[ñn]a|pago|moneda|d[oó]lar/i, 'exterior'],
  [/emisora|ciudad|frecuencia|caracas|maracaibo|valencia|m[eé]rida/i, 'emisoras'],
  [/certific|prueba|son[oó]|al aire|emisi[oó]n/i, 'certificado'],
  [/conatel|normativ|revis|cumpl/i, 'normativa'],
  [/formato|segundo|cu[ñn]a|mencion|patrocin|duraci/i, 'formatos'],
  [/persona|humano|asesor|ventas|whatsapp|llamar|contacto/i, 'persona'],
  [/gracias|genial|perfecto/i, 'gracias'],
  [/hola|buenas|hey/i, 'hola'],
];

export const RAPIDAS: Array<[string, Tema]> = [
  ['¿Cómo compro?', 'comprar'],
  ['Precios', 'precios'],
  ['¿Desde el exterior?', 'exterior'],
  ['Emisoras', 'emisoras'],
  ['¿Cómo sé que sonó?', 'certificado'],
  ['Hablar con una persona', 'persona'],
];

export const SIN_RESPUESTA =
  'Mmm, eso no lo tengo claro todavía 🤔. Te puedo contar cómo comprar, precios, emisoras o el certificado, o pasarte con una persona.';

/** Qué contestar a un mensaje libre. Pura, para poder probarla. */
export function responder(texto: string): string {
  const regla = REGLAS.find(([re]) => re.test(texto));
  return regla ? RESPUESTAS[regla[1]] : SIN_RESPUESTA;
}
