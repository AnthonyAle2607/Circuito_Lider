import Image from 'next/image';
import type { Imagen } from '@/lib/imagenes';

/**
 * Una foto del manifiesto que llena su caja (recortada con object-fit: cover). La caja la define quien la usa (alto
 * fijo o proporción), así la página no salta al cargar. `sizes` dice qué ancho ocupa en pantalla para que next/image
 * sirva el tamaño justo en AVIF o WebP; `prioridad` solo para lo que se ve sin desplazarse (el héroe).
 */
export function Foto({
  img,
  sizes,
  prioridad = false,
  className,
  posicion = 'center',
}: {
  img: Imagen;
  sizes: string;
  prioridad?: boolean;
  className?: string;
  posicion?: string;
}) {
  return (
    <span className={`foto ${className ?? ''}`}>
      <Image src={img.src} alt={img.alt} fill sizes={sizes} priority={prioridad} quality={72} style={{ objectFit: 'cover', objectPosition: posicion }} />
    </span>
  );
}
