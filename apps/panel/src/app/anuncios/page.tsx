import Link from 'next/link';
import { AnuncioEnRevision } from '@sp/schemas';
import { decidirAnuncio, salir } from '../acciones';
import { leerMarca } from '@/lib/marca';
import { apiEquipo } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

const seg = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);

/**
 * Revisión humana de spots (PT-6): lo que la revisión automática no pudo dar por bueno (una palabra prohibida, o sin
 * transcripción). El revisor escucha, mira dónde apareció cada palabra y decide.
 */
export default async function PanelAnuncios({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const q = await searchParams;
  const c = leerMarca().colores;
  const r = await apiEquipo('/v1/panel/anuncios');
  if (r.status === 403) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 16px' }}>
        <p role="alert">Tu rol no permite revisar anuncios. Pide acceso de revisor o gerencia.</p>
      </main>
    );
  }
  const cola = AnuncioEnRevision.array().parse(await r.json());
  const boton = { border: 0, borderRadius: 999, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' } as const;

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px 64px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: c.acento, letterSpacing: 2, textTransform: 'uppercase', fontSize: 13, margin: 0 }}>Panel · Revisión de anuncios</p>
          <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', margin: '4px 0' }}>
            {cola.length} {cola.length === 1 ? 'anuncio espera' : 'anuncios esperan'} revisión
          </h1>
        </div>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/parrilla" style={{ color: c.texto_suave }}>Parrilla</Link>
          <Link href="/conversaciones" style={{ color: c.texto_suave }}>Conversaciones</Link>
          <Link href="/pagos" style={{ color: c.texto_suave }}>Pagos</Link>
          <form action={salir}>
            <button type="submit" style={{ background: 'transparent', color: c.texto_suave, border: `1px solid ${c.texto_suave}`, borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}>Salir</button>
          </form>
        </nav>
      </header>
      {q.aviso && <p role="status" style={{ color: c.acento }}>{q.aviso}</p>}
      {q.error && <p role="alert" style={{ color: c.alerta }}>{q.error}</p>}
      <p style={{ color: c.texto_suave, fontSize: 14 }}>
        Llegan aquí los spots en los que se oyó una palabra de la lista o que no se pudieron transcribir. Al rechazar, escribe qué debe cambiar el cliente: es lo
        que verá en su panel. Cada decisión queda en la bitácora.
      </p>

      {cola.length === 0 && <p style={{ background: c.superficie, padding: 20, borderRadius: 8 }}>No hay anuncios pendientes.</p>}

      <div style={{ display: 'grid', gap: 16 }}>
        {cola.map((a) => (
          <article key={a.id} style={{ background: c.superficie, borderRadius: 10, padding: 20, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: 'Oswald, Impact, sans-serif', fontSize: 24 }}>{a.nombre}</h2>
                <span style={{ color: c.texto_suave, fontSize: 14 }}>
                  {a.empresa} · {a.archivoNombre} · {seg(a.duracionMs)} · subido {new Date(a.creadoAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              <span style={{ color: c.acento, fontSize: 14 }}>{a.motivo}</span>
            </div>
            {a.formato === 'mp4' ? (
              <video controls preload="none" src={`/anuncios/${a.id}/audio`} style={{ width: '100%', maxWidth: 520, maxHeight: 240 }} />
            ) : (
              <audio controls preload="none" src={`/anuncios/${a.id}/audio`} style={{ width: '100%', maxWidth: 520 }} />
            )}
            {a.coincidencias.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {a.coincidencias.map((x, i) => (
                  <li key={`${x.palabra}-${x.segundo}-${i}`}>
                    <strong style={{ color: c.acento }}>«{x.palabra}»</strong> en el segundo {x.segundo}: <em style={{ color: c.texto_suave }}>{x.contexto}</em>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary style={{ cursor: 'pointer', color: c.texto_suave }}>Transcripción</summary>
              <p style={{ margin: '8px 0 0' }}>{a.transcripcion ?? 'Sin transcripción automática: escucha el audio completo.'}</p>
            </details>
            <form action={decidirAnuncio} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="hidden" name="id" value={a.id} />
              <input
                name="motivo"
                aria-label="Motivo para el cliente (obligatorio al rechazar)"
                placeholder="Motivo para el cliente (obligatorio al rechazar)"
                maxLength={1000}
                style={{ flex: '1 1 320px', background: c.fondo, color: c.texto, border: `1px solid ${c.texto_suave}`, borderRadius: 6, padding: '8px 10px' }}
              />
              <button name="decision" value="aprobar" type="submit" style={{ ...boton, background: c.acento, color: c.fondo }}>Aprobar</button>
              <button name="decision" value="rechazar" type="submit" style={{ ...boton, background: 'transparent', color: c.texto, border: `1px solid ${c.texto_suave}` }}>Rechazar</button>
            </form>
          </article>
        ))}
      </div>
    </main>
  );
}
