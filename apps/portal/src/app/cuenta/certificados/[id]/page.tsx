import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Certificado } from '@sp/schemas';
import { Imprimir } from '@/componentes/Imprimir';
import { api } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificado de emisión · Invermedia Radio', robots: { index: false } };

/**
 * El certificado de una emisión, listo para imprimir o guardar como PDF desde el navegador. Lleva la huella SHA-256
 * del audio: si alguien altera el recorte, la huella ya no coincide.
 */
export default async function VerCertificado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await api(`/v1/certificados/${id}`, { conSesion: true });
  if (r.status === 401) redirect(`/ingresar?siguiente=/cuenta/certificados/${id}`);
  if (!r.ok) notFound();
  const c = Certificado.parse(r.datos);
  const cuando = new Date(c.emitidoAt);
  const caracas = (o: Intl.DateTimeFormatOptions) => cuando.toLocaleString('es-VE', { timeZone: 'America/Caracas', ...o });

  return (
    <>
      <span className="label sin-imprimir">
        <Link href="/cuenta/certificados">← Certificados</Link>
      </span>
      <article className="certificado">
        <header>
          <span className="label">Certificado de emisión</span>
          <h1>{c.anuncio.nombre}</h1>
          <p>
            Sonó en <b>{c.emisora.nombre} {c.emisora.frecuencia}</b> ({c.emisora.ciudad}, Venezuela).
          </p>
        </header>
        <dl>
          <div>
            <dt>Fecha</dt>
            <dd>{caracas({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>Hora de inicio</dt>
            <dd>{caracas({ hour: '2-digit', minute: '2-digit', second: '2-digit' })} (hora de Venezuela, UTC−4)</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{(c.duracionMs / 1000).toFixed(1).replace('.', ',')} segundos</dd>
          </div>
          <div>
            <dt>Coincidencia con tu anuncio</dt>
            <dd>{Math.round(c.parecido * 100)} % (comparación de huella acústica con la grabación de la emisora)</dd>
          </div>
          <div>
            <dt>N.º de certificado</dt>
            <dd className="mono">{c.id}</dd>
          </div>
          <div>
            <dt>Huella del audio (SHA-256)</dt>
            <dd className="mono">{c.sha256}</dd>
          </div>
        </dl>
        <audio className="anuncio-medio sin-imprimir" controls preload="metadata" src={`/cuenta/certificados/${c.id}/audio`} />
        <p className="nota">
          La hora es la del streaming en línea de la emisora, que puede ir unos segundos detrás de la señal FM. Emitido por Invermedia Radio el{' '}
          {new Date(c.creadoAt).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long' })}. Este certificado no se modifica ni se
          borra.
        </p>
      </article>
      <div className="acciones sin-imprimir">
        <Imprimir />
        <a className="btn" href={`/cuenta/certificados/${c.id}/audio`} download={`emision-${c.id.slice(0, 8)}.mp3`}>
          Descargar el audio
        </a>
      </div>
    </>
  );
}
