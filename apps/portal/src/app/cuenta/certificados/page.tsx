import Link from 'next/link';

export const metadata = { title: 'Certificados · Invermedia Radio', robots: { index: false } };

/** Los certificados de emisión llegan con la grabación de las emisoras (PT-7). */
export default function Certificados() {
  return (
    <>
      <h1>Certificados</h1>
      <p className="intro">La prueba de que tu anuncio sonó: emisora, fecha, hora exacta y el audio de ese momento.</p>
      <div className="tarjeta vacio">
        <p>
          <b>Todavía no tienes certificados.</b> Cada vez que tu anuncio salga al aire, aparecerá aquí con:
        </p>
        <ul className="puntos">
          <li>La emisora, la fecha y la hora exacta en que sonó.</li>
          <li>El fragmento de audio grabado de la emisora, para escucharlo.</li>
          <li>Un PDF descargable. Los certificados no se borran.</li>
        </ul>
        <Link className="btn" href="/cuenta/campanas">
          Ver mis campañas
        </Link>
      </div>
    </>
  );
}
