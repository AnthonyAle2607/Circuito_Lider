import Link from 'next/link';
import { BotonVivo } from '@/componentes/Radio';
import { emisoras, parrilla } from '@/lib/api';
import { enAntena } from '@/lib/vivo';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Emisoras en vivo · Invermedia Radio',
  description: 'Escucha en vivo las diez emisoras de Circuito Líder y conoce su programación antes de pautar.',
};

const hora = (h: string) => (h === '24:00' ? '00:00' : h);

/** La vitrina: todas las emisoras, qué suena ahora y el botón para escucharlas en vivo. */
export default async function Emisoras() {
  const lista = await emisoras();
  const parrillas = await Promise.all(lista.map((e) => parrilla(e.slug).catch(() => null)));
  const ahora = new Date();
  // Primero Caracas, después el resto por nombre de ciudad (como las devuelve la API).
  const orden = lista.map((e, i) => ({ e, p: parrillas[i] })).sort((a, b) => (a.e.slug === 'caracas' ? -1 : b.e.slug === 'caracas' ? 1 : 0));

  return (
    <main className="pagina vitrina">
      <div className="wrap">
        <span className="label">Circuito Líder · en vivo</span>
        <h1>Escucha las emisoras</h1>
        <p className="intro">
          Diez emisoras, diez ciudades. Dale play para oír cómo suena cada una ahora mismo y entra a su ficha para ver sus programas y
          horarios antes de pautar.
        </p>

        <div className="rejilla-emisoras">
          {orden.map(({ e, p }) => {
            const a = p ? enAntena(p, ahora) : null;
            return (
              <article key={e.slug} className="tarjeta emisora">
                <div className="emisora-cabeza">
                  <span className="frecuencia">{e.frecuencia.replace(' FM', '')}</span>
                  <span className="fm">FM</span>
                </div>
                <h2>{e.ciudad}</h2>
                <p className="al-aire">
                  {a?.ahora ? (
                    <>
                      <span className="estado reservado">Al aire</span> {a.ahora.programa}
                    </>
                  ) : (
                    <>
                      <span className="estado">Ahora</span> Música continua
                    </>
                  )}
                </p>
                {a?.despues && (
                  <p className="despues">
                    Después: {a.despues.programa} · {hora(a.despues.inicio)}
                  </p>
                )}
                <div className="acciones">
                  <BotonVivo emisora={e} compacto />
                  <Link className="ver" href={`/emisoras/${e.slug}`}>
                    Ver emisora <span className="arrow">→</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        <div className="tarjeta llamada">
          <div>
            <h2>¿Te gustó cómo suena?</h2>
            <p>Elige las emisoras y las horas en la parrilla y recibe el precio al instante.</p>
          </div>
          <Link className="btn primary" href="/#cotizar">
            Cotizar mi pauta <span className="arrow">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
