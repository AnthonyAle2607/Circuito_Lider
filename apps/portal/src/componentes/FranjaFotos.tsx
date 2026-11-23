import { IMAGENES } from '@/lib/imagenes';
import { Foto } from './Foto';

/** Tres fotos bajo el buscador del héroe: la cabina, el «al aire» y el público. Las primeras que ve el visitante. */
export function FranjaFotos() {
  const fotos = [
    { img: IMAGENES.microfonoVintage, texto: 'La cabina', posicion: '40% 50%' },
    { img: IMAGENES.alAire, texto: 'Al aire en 10 ciudades', posicion: 'center' },
    { img: IMAGENES.publico, texto: 'El público que ya escucha', posicion: 'center 70%' },
  ];
  return (
    <div className="franja-fotos">
      {fotos.map((f, i) => (
        <figure key={f.texto} className={i === 0 ? 'ancha' : undefined}>
          <Foto img={f.img} prioridad sizes="(max-width: 760px) 100vw, 33vw" posicion={f.posicion} />
          <figcaption>{f.texto}</figcaption>
        </figure>
      ))}
    </div>
  );
}
