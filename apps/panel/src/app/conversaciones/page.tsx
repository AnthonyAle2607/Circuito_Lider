import Link from 'next/link';
import { cerrarConversacion, salir } from '../acciones';
import { leerMarca } from '@/lib/marca';
import { apiEquipo } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

type Fila = {
  id: string;
  estado: 'agente' | 'traspasada' | 'cerrada';
  prospecto: Record<string, string | number>;
  cotizaciones: number;
  traspaso: { motivo: string; resumen: string | null; at: string | null } | null;
  turnos: number;
  costoUsd: number;
  actualizadoAt: string;
};
type Bandeja = { meta: { pedidosPagados: number; pagadosSinIntervencion: number }; conversaciones: Fila[] };

const fecha = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });
const ESTADO = { agente: 'Con Toño', traspasada: 'Para ventas', cerrada: 'Cerrada' } as const;

/**
 * Bandeja del agente vendedor (PT-5b, rol ventas o gerencia): lo que Toño pasó a una persona va primero, con el motivo
 * y los datos del cliente. Arriba, la meta: qué parte de las ventas pagadas cerró el agente sin ayuda.
 */
export default async function PanelConversaciones({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const q = await searchParams;
  const c = leerMarca().colores;
  const r = await apiEquipo('/v1/panel/agente/conversaciones');
  if (r.status === 403) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 16px' }}>
        <p role="alert">Tu rol no permite ver las conversaciones. Pide acceso de ventas o gerencia.</p>
      </main>
    );
  }
  const b = (await r.json()) as Bandeja;
  const { pedidosPagados: total, pagadosSinIntervencion: solos } = b.meta;
  const pct = total ? Math.round((solos / total) * 100) : 0;
  const tarjeta = { background: c.superficie, borderRadius: 10, padding: 20 } as const;

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px 64px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: c.acento, letterSpacing: 2, textTransform: 'uppercase', fontSize: 13, margin: 0 }}>Panel · Agente vendedor</p>
          <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', margin: '4px 0' }}>Conversaciones con Toño</h1>
        </div>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/pagos" style={{ color: c.texto_suave }}>Pagos</Link>
          <Link href="/anuncios" style={{ color: c.texto_suave }}>Anuncios</Link>
          <form action={salir}>
            <button type="submit" style={{ background: 'transparent', color: c.texto_suave, border: `1px solid ${c.texto_suave}`, borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}>
              Salir
            </button>
          </form>
        </nav>
      </header>
      {q.aviso && <p role="status" style={{ color: c.acento }}>{q.aviso}</p>}
      {q.error && <p role="alert" style={{ color: c.alerta }}>{q.error}</p>}

      <section style={{ ...tarjeta, display: 'flex', gap: 24, alignItems: 'baseline', flexWrap: 'wrap', margin: '16px 0 24px' }}>
        <strong style={{ fontFamily: 'Oswald, Impact, sans-serif', fontSize: 40 }}>{total ? `${pct} %` : '—'}</strong>
        <span style={{ color: c.texto_suave }}>
          de los pedidos pagados los cerró Toño sin ayuda ({solos} de {total}). Meta: 80 %.
        </span>
      </section>

      {b.conversaciones.length === 0 && <p style={tarjeta}>Todavía no hay conversaciones.</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {b.conversaciones.map((f) => (
          <article key={f.id} style={{ ...tarjeta, display: 'grid', gap: 8, borderLeft: `4px solid ${f.estado === 'traspasada' ? c.acento : 'transparent'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Link href={`/conversaciones/${f.id}`} style={{ color: c.texto, fontWeight: 700 }}>
                {String(f.prospecto.empresa ?? f.prospecto.nombre ?? 'Visitante sin datos')}
              </Link>
              <span style={{ color: f.estado === 'traspasada' ? c.acento : c.texto_suave }}>{ESTADO[f.estado]}</span>
            </div>
            {f.traspaso && (
              <p style={{ margin: 0 }}>
                <b>{f.traspaso.motivo}.</b> {f.traspaso.resumen}
              </p>
            )}
            <span style={{ color: c.texto_suave, fontSize: 14 }}>
              {[f.prospecto.correo, f.prospecto.telefono, f.prospecto.pais].filter(Boolean).join(' · ') || 'Sin contacto'} · {f.turnos} mensajes · {f.cotizaciones} cotizaciones · USD{' '}
              {f.costoUsd.toFixed(2)} · {fecha(f.actualizadoAt)}
            </span>
            {f.estado === 'traspasada' && (
              <form action={cerrarConversacion}>
                <input type="hidden" name="id" value={f.id} />
                <button type="submit" style={{ border: 0, borderRadius: 999, padding: '6px 14px', fontWeight: 700, cursor: 'pointer', background: c.acento, color: c.fondo }}>
                  Marcar como atendida
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
