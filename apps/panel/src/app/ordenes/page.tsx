import Link from 'next/link';
import { OrdenDePauta } from '@sp/schemas';
import { confirmarOrden, salir } from '../acciones';
import { leerMarca } from '@/lib/marca';
import { apiEquipo } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-VE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const seg = (ms: number | null) => (ms === null ? '—' : `${Math.round(ms / 1000)} s`);

/**
 * Órdenes de pauta (RF-20, RF-21, rol programación o gerencia), agrupadas por emisora: qué spot cargar, en qué fechas
 * y programas, el archivo para bajarlo y el botón para confirmar que quedó cargado.
 */
export default async function PanelOrdenes({ searchParams }: { searchParams: Promise<{ estado?: string; aviso?: string; error?: string }> }) {
  const q = await searchParams;
  const estado = q.estado === 'cargada' ? 'cargada' : 'pendiente';
  const c = leerMarca().colores;
  const r = await apiEquipo(`/v1/panel/ordenes?estado=${estado}`);
  if (r.status === 403) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 16px' }}>
        <p role="alert">Tu rol no permite ver las órdenes de pauta. Pide acceso de programación o gerencia.</p>
      </main>
    );
  }
  const ordenes = OrdenDePauta.array().parse(await r.json());
  const porEmisora = new Map<string, OrdenDePauta[]>();
  for (const o of ordenes) porEmisora.set(`${o.emisora} · ${o.frecuencia}`, [...(porEmisora.get(`${o.emisora} · ${o.frecuencia}`) ?? []), o]);
  const pestaña = (valor: string, texto: string) => (
    <Link href={`/ordenes?estado=${valor}`} style={{ color: estado === valor ? c.texto : c.texto_suave, fontWeight: estado === valor ? 700 : 400 }}>
      {texto}
    </Link>
  );

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px 64px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: c.acento, letterSpacing: 2, textTransform: 'uppercase', fontSize: 13, margin: 0 }}>Panel · Programación</p>
          <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', margin: '4px 0' }}>
            {ordenes.length} {ordenes.length === 1 ? 'orden' : 'órdenes'} {estado === 'pendiente' ? 'por cargar' : 'cargadas'}
          </h1>
        </div>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {pestaña('pendiente', 'Por cargar')}
          {pestaña('cargada', 'Cargadas')}
          <Link href="/parrilla" style={{ color: c.texto_suave }}>Parrilla</Link>
          <form action={salir}>
            <button type="submit" style={{ background: 'transparent', color: c.texto_suave, border: `1px solid ${c.texto_suave}`, borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}>
              Salir
            </button>
          </form>
        </nav>
      </header>
      {q.aviso && <p role="status" style={{ color: c.acento }}>{q.aviso}</p>}
      {q.error && <p role="alert" style={{ color: c.alerta }}>{q.error}</p>}
      {ordenes.length === 0 && <p style={{ background: c.superficie, padding: 20, borderRadius: 8 }}>{estado === 'pendiente' ? 'No hay órdenes por cargar.' : 'Todavía no hay órdenes cargadas.'}</p>}

      {[...porEmisora].map(([emisora, lista]) => (
        <section key={emisora} style={{ marginTop: 24 }}>
          <h2 style={{ fontFamily: 'Oswald, Impact, sans-serif', fontSize: 22, margin: '0 0 10px' }}>{emisora}</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {lista.map((o) => (
              <article key={o.id} style={{ background: c.superficie, borderRadius: 10, padding: 18, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>
                    {o.empresa} · «{o.anuncio}» ({o.formato.toUpperCase()}, {seg(o.duracionMs)})
                  </strong>
                  <a href={`/ordenes/${o.id}/spot`} style={{ color: c.acento }}>Bajar el spot</a>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: c.texto_suave, fontSize: 14 }}>
                  {o.lineas.map((l) => (
                    <li key={`${l.fecha}-${l.inicio}-${l.programa}`}>
                      {fecha(l.fecha)} · {l.inicio}–{l.fin} · {l.programa} · {l.segundos} s
                    </li>
                  ))}
                </ul>
                {o.nota && <p style={{ margin: 0, fontSize: 14 }}>Nota: {o.nota}</p>}
                {o.estado === 'pendiente' && (
                  <form action={confirmarOrden} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="hidden" name="id" value={o.id} />
                    <input
                      name="nota"
                      aria-label="Nota (opcional)"
                      placeholder="Nota (opcional)"
                      maxLength={500}
                      style={{ flex: '1 1 260px', background: c.fondo, color: c.texto, border: `1px solid ${c.texto_suave}`, borderRadius: 6, padding: '8px 10px' }}
                    />
                    <button type="submit" style={{ border: 0, borderRadius: 999, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', background: c.acento, color: c.fondo }}>
                      Marcar como cargada
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
