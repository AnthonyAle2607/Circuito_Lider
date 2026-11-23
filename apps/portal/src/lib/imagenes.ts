/**
 * Manifiesto de las imágenes del portal (viven en `public/imagenes/`). Cada una con sus medidas reales (las pide
 * `next/image` para reservar el espacio y no mover la página al cargar), su texto alternativo y su crédito.
 *
 * Fuentes:
 * - Fotos genéricas de radio y de ciudades: Unsplash (Licencia de Unsplash: uso comercial permitido, sin atribución
 *   obligatoria; igual se acredita en /legal/creditos). Elegidas y revisadas una por una el 2026-11-23.
 * - Logos de las emisoras, artes de los programas y fotos de locutores: los entrega Circuito Líder (pendiente). Se
 *   agregan en `public/imagenes/circuito-lider/` y aquí; mientras falten, el diseño usa sus bloques de color.
 */

export interface Imagen {
  src: string;
  ancho: number;
  alto: number;
  alt: string;
  credito: { autor: string; usuario: string; url: string; fuente: 'Unsplash' | 'Circuito Líder' };
}

/** Crédito de Unsplash: enlaza a la foto cuando se conoce su id, si no al perfil del autor. */
const unsplash = (autor: string, usuario: string, id?: string): Imagen['credito'] => ({
  autor,
  usuario,
  url: id ? `https://unsplash.com/photos/${id}` : `https://unsplash.com/@${usuario}`,
  fuente: 'Unsplash',
});

export const IMAGENES = {
  microfonoVintage: {
    src: '/imagenes/radio/microfono-vintage.jpg',
    ancho: 1600,
    alto: 900,
    alt: 'Micrófono de radio vintage en una cabina con luz cálida',
    credito: unsplash('Jacob Hodgson', 'hodgsons', 'Jymh4EctxLs'),
  },
  microfonoEstudio: {
    src: '/imagenes/radio/microfono-estudio.jpg',
    ancho: 1600,
    alto: 1067,
    alt: 'Micrófono de condensador en un estudio de grabación oscuro',
    credito: unsplash('Jonathan Velasquez', 'jonathanvez'),
  },
  microfonoCabina: {
    src: '/imagenes/radio/microfono-cabina.jpg',
    ancho: 1600,
    alto: 2349,
    alt: 'Micrófono de cabina frente a los monitores de una emisora',
    credito: unsplash('Koen Sweers', 'koensweers', 'O6B3_2ylHLo'),
  },
  alAire: {
    src: '/imagenes/radio/al-aire.jpg',
    ancho: 1600,
    alto: 1067,
    alt: 'Letrero luminoso «On Air» encendido en la pared de un estudio',
    credito: unsplash('Jakub Żerdzicki', 'jakubzerdzicki'),
  },
  alAireRojo: {
    src: '/imagenes/radio/al-aire-rojo.jpg',
    ancho: 1600,
    alto: 1600,
    alt: 'Letrero rojo «On Air» sobre la puerta de una cabina',
    credito: unsplash('Kennedy Kebarile', 'kebarile'),
  },
  publico: {
    src: '/imagenes/radio/publico.jpg',
    ancho: 1600,
    alto: 1200,
    alt: 'Público con las manos en alto frente a un escenario iluminado',
    credito: unsplash('ActionVance', 'actionvance'),
  },
  publicoLuces: {
    src: '/imagenes/radio/publico-luces.jpg',
    ancho: 1600,
    alto: 2399,
    alt: 'Público en un concierto bajo luces azules',
    credito: unsplash('Marcel Strauß', 'martzzl'),
  },
} satisfies Record<string, Imagen>;

/** Foto de la ciudad de cada emisora. Solo las verificadas: las demás usan el bloque de color de la marca. */
export const CIUDADES: Partial<Record<string, Imagen>> = {
  caracas: {
    src: '/imagenes/ciudades/caracas.jpg',
    ancho: 1800,
    alto: 1200,
    alt: 'Caracas al pie de El Ávila',
    credito: unsplash('Eduardo Juhyun Kim', 'eduardocde', 'ReCqvCTtH9A'),
  },
  maracaibo: {
    src: '/imagenes/ciudades/maracaibo.jpg',
    ancho: 1800,
    alto: 1200,
    alt: 'Puente sobre el Lago de Maracaibo',
    credito: unsplash('Elvis Amaya', 'elvisabraham'),
  },
  margarita: {
    src: '/imagenes/ciudades/margarita.jpg',
    ancho: 1800,
    alto: 1196,
    alt: 'Playa con palmeras en la isla de Margarita',
    credito: unsplash('Martha Dominguez de Gouveia', 'm_dominguez_marketing'),
  },
  merida: {
    src: '/imagenes/ciudades/merida.jpg',
    ancho: 1800,
    alto: 1355,
    alt: 'Mérida en su valle entre montañas andinas',
    credito: unsplash('Jhon Vielma', '_javv'),
  },
};

/** Foto extra de Caracas (vista aérea) para los paquetes. */
export const CARACAS_AEREA: Imagen = {
  src: '/imagenes/ciudades/caracas-aerea.jpg',
  ancho: 1800,
  alto: 2400,
  alt: 'Vista aérea de Chacao y Altamira desde El Ávila, en Caracas',
  credito: unsplash('Edgardo Ibarra', 'shotsbyedgardo', 'avbuuUBnxJg'),
};

/**
 * Fondo de las tarjetas de programa mientras Circuito Líder no envíe sus artes: se reparten las fotos de radio, la
 * misma siempre para el mismo programa. La marca va encima con un velo de color plano (sin degradados).
 */
const FONDOS_PROGRAMA: Imagen[] = [IMAGENES.microfonoVintage, IMAGENES.alAire, IMAGENES.microfonoEstudio, IMAGENES.publico, IMAGENES.alAireRojo, IMAGENES.microfonoCabina, IMAGENES.publicoLuces];

export function fondoDePrograma(clave: string): Imagen {
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FONDOS_PROGRAMA[h % FONDOS_PROGRAMA.length]!;
}

/** Todas, para la página de créditos. */
export function todasLasImagenes(): Imagen[] {
  return [...Object.values(IMAGENES), ...Object.values(CIUDADES).filter((x): x is Imagen => Boolean(x)), CARACAS_AEREA];
}

/** Foto de radio n.º i (en orden, sin repetir mientras alcancen): para las emisoras que aún no tienen foto de ciudad. */
export function fotoDeRadio(i: number): Imagen {
  return FONDOS_PROGRAMA[i % FONDOS_PROGRAMA.length]!;
}
