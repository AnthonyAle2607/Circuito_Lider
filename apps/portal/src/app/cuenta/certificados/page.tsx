import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Certificado } from '@sp/schemas';
import { api } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificados · Invermedia Radio', robots: { index: false } };

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** PT-7: cada emisión encontrada en la grabación de la emisora, con su hora exacta y el audio de ese momento. */
export default async function Certificados() {
  const r = await api('/v1/certificados', { conSesion: true });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/certificados');
  const lista = r.ok ? Certificado.array().parse(r.datos) : null;
  // Agrupados por día (hora de Venezuela), del más reciente al más viejo.
  const dias = new Map<string, Certificado[]>();
  for (const c of lista ?? []) {
    const d = dia(c.emitidoAt);
    dias.set(d, [...(dias.get(d) ?? []), c]);
  }

  return (
    <>
      <h1>Certificados</h1>
      <p className="intro">
        Grabamos cada emisora y buscamos tu anuncio en la grabación. Cada vez que suena, aparece aquí con la hora exacta y el audio de ese momento. Los
        certificados no se borran.
      </p>
      {lista === null ? (
        <div className="aviso error">No pudimos cargar tus certificados. Intenta de nuevo en un momento.</div>
      ) : lista.length === 0 ? (
        <div className="tarjeta vacio">
          <p>
            <b>Todavía no tienes emisiones certificadas.</b> Para que aparezcan:
          </p>
          <ul className="puntos">
            <li>Tu campaña necesita un anuncio aprobado asignado (en el detalle de la campaña).</li>
            <li>Cuando suene, lo encontramos en la grabación de la emisora en las horas siguientes.</li>
          </ul>
          <Link className="btn" href="/cuenta/campanas">
            Ver mis campañas
          </Link>
        </div>
      ) : (
        <>
          <p className="nota">
            {lista.length} {lista.length === 1 ? 'emisión certificada' : 'emisiones certificadas'}. Horas de Venezuela, según el streaming de cada emisora.
          </p>
          {[...dias.entries()].map(([d, cs]) => (
            <section key={d} className="dia-certificados">
              <h2 className="sub">{d}</h2>
              <div className="lista-anuncios">
                {cs.map((c) => (
                  <article key={c.id} className="tarjeta anuncio">
                    <div className="anuncio-cabeza">
                      <div>
                        <h3>
                          {hora(c.emitidoAt)} · {c.emisora.nombre} {c.emisora.frecuencia}
                        </h3>
                        <span className="nota">
                          «{c.anuncio.nombre}» · {(c.duracionMs / 1000).toFixed(1).replace('.', ',')} s · coincidencia {Math.round(c.parecido * 100)} %
                        </span>
                      </div>
                      <span className="estado pagado">Al aire</span>
                    </div>
                    <audio className="anuncio-medio" controls preload="none" src={`/cuenta/certificados/${c.id}/audio`} />
                    <Link href={`/cuenta/certificados/${c.id}`}>Ver y descargar el certificado →</Link>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
