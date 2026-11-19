import { redirect } from 'next/navigation';
import { Anuncio } from '@sp/schemas';
import { RefrescoMientrasProcesa, SubirAnuncio } from '@/componentes/SubirAnuncio';
import { fechaCorta } from '@/lib/fechas';
import { api } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mis anuncios · Invermedia Radio', robots: { index: false } };

/** Reglas vigentes (config/spots.yaml): las repite aquí la ayuda del formulario. */
const MAXIMO_SEGUNDOS = 40;

const ESTADOS: Record<string, { texto: string; clase: string; ayuda: string }> = {
  procesando: { texto: 'Revisando…', clase: 'vigente', ayuda: 'Medimos la duración y escuchamos el contenido. Tarda unos segundos.' },
  aprobado: { texto: 'Aprobado', clase: 'pagado', ayuda: 'Listo para salir al aire en tus campañas.' },
  en_revision: { texto: 'En revisión', clase: 'reservado', ayuda: 'Una persona del equipo lo está escuchando. Te avisamos del resultado.' },
  rechazado: { texto: 'Necesita cambios', clase: 'cancelado', ayuda: '' },
};

const seg = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
const peso = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function Anuncios() {
  const r = await api('/v1/anuncios', { conSesion: true });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/anuncios');
  const lista = r.ok ? Anuncio.array().parse(r.datos) : null;
  const procesando = (lista ?? []).some((a) => a.estado === 'procesando');

  return (
    <>
      <h1>Mis anuncios</h1>
      <p className="intro">
        Sube tu spot y revisamos que dure {MAXIMO_SEGUNDOS} segundos o menos y que no tenga contenido no apto para radio. Si algo no cumple, te decimos
        qué cambiar.
      </p>
      <SubirAnuncio maximoSegundos={MAXIMO_SEGUNDOS} />
      <RefrescoMientrasProcesa activo={procesando} />

      <h2 className="sub">Tus anuncios</h2>
      {lista === null ? (
        <div className="aviso error">No pudimos cargar tus anuncios. Intenta de nuevo en un momento.</div>
      ) : lista.length === 0 ? (
        <p className="nota">Todavía no has subido ningún anuncio.</p>
      ) : (
        <div className="lista-anuncios">
          {lista.map((a) => {
            const e = ESTADOS[a.estado]!;
            return (
              <article key={a.id} className="tarjeta anuncio">
                <div className="anuncio-cabeza">
                  <div>
                    <h3>{a.nombre}</h3>
                    <span className="nota">
                      {a.archivoNombre} · {a.formato.toUpperCase()} · {seg(a.duracionMs)} · {peso(a.bytes)} · {fechaCorta(a.creadoAt.slice(0, 10))}
                    </span>
                  </div>
                  <span className={`estado ${e.clase}`}>{e.texto}</span>
                </div>
                {(a.motivo || e.ayuda) && <p className="anuncio-motivo">{a.estado === 'rechazado' || a.estado === 'en_revision' ? (a.motivo ?? e.ayuda) : e.ayuda}</p>}
                {a.formato === 'mp4' ? (
                  <video className="anuncio-medio" controls preload="none" src={`/cuenta/anuncios/${a.id}/audio`} />
                ) : (
                  <audio className="anuncio-medio" controls preload="none" src={`/cuenta/anuncios/${a.id}/audio`} />
                )}
                {a.transcripcion && (
                  <details>
                    <summary>Lo que entendimos del audio</summary>
                    <p>{a.transcripcion}</p>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
