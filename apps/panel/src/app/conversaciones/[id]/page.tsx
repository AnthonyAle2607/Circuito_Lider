import Link from 'next/link';
import { notFound } from 'next/navigation';
import { leerMarca } from '@/lib/marca';
import { apiEquipo } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

type Detalle = {
  id: string;
  estado: string;
  prospecto: Record<string, string | number>;
  traspaso_motivo: string | null;
  traspaso_resumen: string | null;
  mensajes: Array<{ quien: 'cliente' | 'agente' | 'herramienta'; texto: string; at: string }>;
};

const hora = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', timeStyle: 'short', dateStyle: 'short' });

/** La transcripción de una conversación: lo que dijeron el cliente y Toño, y qué herramientas usó. */
export default async function VerConversacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await apiEquipo(`/v1/panel/agente/conversaciones/${id}`);
  if (r.status === 404) notFound();
  if (!r.ok) return <p role="alert" style={{ padding: 32 }}>No se pudo abrir la conversación.</p>;
  const d = (await r.json()) as Detalle;
  const c = leerMarca().colores;
  const datos = Object.entries(d.prospecto);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 64px', display: 'grid', gap: 16 }}>
      <Link href="/conversaciones" style={{ color: c.texto_suave }}>← Conversaciones</Link>
      <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', margin: 0 }}>{String(d.prospecto.empresa ?? d.prospecto.nombre ?? 'Visitante')}</h1>
      {d.traspaso_motivo && (
        <p style={{ background: c.superficie, borderLeft: `4px solid ${c.acento}`, padding: 14, margin: 0 }}>
          <b>{d.traspaso_motivo}.</b> {d.traspaso_resumen}
        </p>
      )}
      {datos.length > 0 && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: 0 }}>
          {datos.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt style={{ color: c.texto_suave }}>{k.replace('_', ' ')}</dt>
              <dd style={{ margin: 0 }}>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {d.mensajes.map((m, i) =>
          m.quien === 'herramienta' ? (
            <li key={i} style={{ color: c.texto_suave, fontSize: 13 }}>
              · usó {m.texto}
            </li>
          ) : (
            <li
              key={i}
              style={{
                justifySelf: m.quien === 'cliente' ? 'end' : 'start',
                maxWidth: '85%',
                background: m.quien === 'cliente' ? c.acento : c.superficie,
                color: m.quien === 'cliente' ? c.fondo : c.texto,
                borderRadius: 12,
                padding: '10px 14px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.texto}
              <small style={{ display: 'block', opacity: 0.7, marginTop: 4 }}>{hora(m.at)}</small>
            </li>
          ),
        )}
      </ol>
    </main>
  );
}
