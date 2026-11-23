import { IMAGENES } from '@/lib/imagenes';
import { Foto } from '../Foto';

const PASOS = [
  { titulo: 'Elige', texto: 'Programas y emisoras, en cadena o ciudad por ciudad, con el precio a la vista.' },
  { titulo: 'Sube tu anuncio', texto: 'MP3, WAV o MP4 de 30 o 40 segundos. Una persona lo revisa según la normativa de CONATEL.' },
  { titulo: 'Paga en línea', texto: 'Un solo pago para las diez emisoras, desde cualquier país.' },
  { titulo: 'Al aire y certificado', texto: 'Cada emisión con su hora, su emisora y el audio grabado de ese momento.' },
];

/** «Cómo funciona»: fotos de cabina a la izquierda (a color, sin velos) y los cuatro pasos a la derecha. */
export function ComoFunciona() {
  return (
    <section id="como" className="seccion clara alterna">
      <div className="wrap como">
        <div className="como-fotos">
          <Foto img={IMAGENES.microfonoEstudio} sizes="(max-width: 900px) 100vw, 560px" className="como-foto-grande" posicion="center 40%" />
          <Foto img={IMAGENES.alAire} sizes="(max-width: 900px) 50vw, 270px" className="como-foto" />
          <Foto img={IMAGENES.publico} sizes="(max-width: 900px) 50vw, 270px" className="como-foto" posicion="center 70%" />
        </div>
        <div>
          <header className="encabezado">
            <span className="sobretitulo">Cómo funciona</span>
            <h2>
              Del archivo al aire en <em>4 pasos</em>
            </h2>
          </header>
          <ol className="pasos">
            {PASOS.map((p, i) => (
              <li key={p.titulo}>
                <span className="n" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
