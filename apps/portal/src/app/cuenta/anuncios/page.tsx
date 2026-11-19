import Link from 'next/link';

export const metadata = { title: 'Mis anuncios · Invermedia Radio', robots: { index: false } };

/** La subida y revisión de spots llega en PT-6; mientras tanto la sección explica qué va a pasar aquí. */
export default function Anuncios() {
  return (
    <>
      <h1>Mis anuncios</h1>
      <p className="intro">Aquí subirás tu spot y verás en qué punto está su revisión.</p>
      <div className="tarjeta vacio">
        <p>
          <b>Todavía no tienes anuncios.</b> La subida de spots se está habilitando. Cuando esté lista, podrás:
        </p>
        <ul className="puntos">
          <li>Subir tu anuncio en MP4, MP3 o WAV, de hasta 40 segundos.</li>
          <li>Ver su estado: en revisión, aprobado o con cambios pedidos.</li>
          <li>Asignarlo a tus campañas.</li>
        </ul>
        <Link className="btn" href="/cuenta/campanas">
          Ver mis campañas
        </Link>
      </div>
    </>
  );
}
