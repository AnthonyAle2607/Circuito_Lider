import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BotonVivo } from '@/componentes/Radio';
import { emisoras, parrilla } from '@/lib/api';
import { cuando, enAntena, horario } from '@/lib/vivo';

export const dynamic = 'force-dynamic';

const hora = (h: string) => (h === '24:00' ? '00:00' : h);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = /^[a-z0-9-]{2,40}$/.test(slug) ? await parrilla(slug) : null;
  if (!p) return { title: 'Emisora · Invermedia Radio' };
  return { title: `${p.emisora.nombre} ${p.emisora.frecuencia} en vivo · Invermedia Radio`, description: p.emisora.descripcion ?? undefined };
}

/** La ficha de una emisora: escucharla, saber qué suena y conocer cada programa antes de pautar en ella. */
export default async function FichaEmisora({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) notFound();
  const [p, todas] = await Promise.all([parrilla(slug), emisoras()]);
  if (!p) notFound();
  const e = p.emisora;
  const { ahora, despues } = enAntena(p);
  const nacionales = p.programas.filter((x) => x.alcance === 'nacional');
  const locales = p.programas.filter((x) => x.alcance === 'local');

  const tarjeta = (pr: (typeof p.programas)[number]) => (
    <article key={pr.id} className={`tarjeta programa${ahora?.programa === pr.nombre ? ' al-aire-ahora' : ''}`}>
      <div className="programa-cabeza">
        <h3>{pr.nombre}</h3>
        <span className={`estado ${pr.alcance === 'nacional' ? 'reservado' : ''}`}>{pr.alcance === 'nacional' ? 'En cadena' : 'Local'}</span>
      </div>
      {pr.descripcion && <p>{pr.descripcion}</p>}
      <ul className="horarios">
        {horario(pr.franjas).map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      {pr.locutores && <p className="conducen">Conducen: {pr.locutores}</p>}
    </article>
  );

  return (
    <main className="pagina vitrina">
      <div className="wrap">
        <span className="label">
          <Link href="/emisoras">← Todas las emisoras</Link>
        </span>

        <div className="ficha-cabeza">
          <div className="ficha-dial" aria-hidden="true">
            <span className="frecuencia">{e.frecuencia.replace(' FM', '')}</span>
            <span className="fm">FM</span>
          </div>
          <div>
            <h1>{e.nombre}</h1>
            <p className="intro">{e.descripcion ?? `La señal de Circuito Líder en ${e.ciudad}.`}</p>
            <div className="acciones">
              <BotonVivo emisora={e} />
              <Link className="btn" href={`/parrilla?emisora=${e.slug}`}>
                Ver la parrilla hora por hora
              </Link>
            </div>
          </div>
        </div>

        <div className="cifras ahora-despues">
          <div className="tarjeta cifra">
            <span className="label">Ahora suena</span>
            <b>{ahora ? ahora.programa : 'Música continua'}</b>
            {ahora && (
              <small>
                Hasta las {hora(ahora.fin)} · {ahora.alcance === 'nacional' ? 'en cadena nacional' : `solo en ${e.ciudad}`}
              </small>
            )}
          </div>
          <div className="tarjeta cifra">
            <span className="label">Después</span>
            <b>{despues ? despues.programa : '—'}</b>
            {despues && (
              <small>
                {cuando(despues.dia)} a las {hora(despues.inicio)}
              </small>
            )}
          </div>
        </div>
        <p className="nota">Horas de Venezuela (UTC−4). Fuera de los programas suena música continua.</p>

        {locales.length > 0 && (
          <>
            <h2 className="sub">Programas de {e.ciudad}</h2>
            <p className="nota">Solo suenan en esta emisora: tu anuncio llega directo al público de la ciudad.</p>
            <div className="rejilla-programas">{locales.map(tarjeta)}</div>
          </>
        )}

        <h2 className="sub">En cadena nacional</h2>
        <p className="nota">Suenan a la vez en las diez emisoras Líder: un mismo anuncio llega a todo el país.</p>
        <div className="rejilla-programas">{nacionales.map(tarjeta)}</div>

        <div className="tarjeta llamada">
          <div>
            <h2>Pauta en {e.ciudad}</h2>
            <p>Elige los programas y las horas de {e.nombre} en el cotizador y recibe el precio al instante.</p>
          </div>
          <Link className="btn primary" href="/#cotizar">
            Cotizar mi pauta <span className="arrow">→</span>
          </Link>
        </div>

        <h2 className="sub">Otras emisoras</h2>
        <nav className="otras-emisoras" aria-label="Otras emisoras">
          {todas
            .filter((x) => x.slug !== e.slug)
            .map((x) => (
              <Link key={x.slug} href={`/emisoras/${x.slug}`}>
                <b>{x.frecuencia.replace(' FM', '')}</b> {x.ciudad}
              </Link>
            ))}
        </nav>
      </div>
    </main>
  );
}
