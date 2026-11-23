import Link from 'next/link';
import { TransferenciaPorRevisar } from '@sp/schemas';
import { decidirPago, salir } from '../acciones';
import { leerMarca } from '@/lib/marca';
import { apiEquipo } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

const dinero = (c: number, m: string) => `${m} ${(c / 100).toLocaleString('es-VE', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const fecha = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Transferencias por revisar (PT-5, rol finanzas o gerencia). Finanzas abre el comprobante, lo cruza con el banco y
 * aprueba (el pedido queda pagado) o rechaza con el motivo que leerá el cliente. Mientras espera, el pedido no vence.
 */
export default async function PanelPagos({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const q = await searchParams;
  const c = leerMarca().colores;
  const r = await apiEquipo('/v1/panel/pagos/transferencias');
  if (r.status === 403) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 16px' }}>
        <p role="alert">Tu rol no permite revisar pagos. Pide acceso de finanzas o gerencia.</p>
      </main>
    );
  }
  const cola = TransferenciaPorRevisar.array().parse(await r.json());
  const boton = { border: 0, borderRadius: 999, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' } as const;

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px 64px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: c.acento, letterSpacing: 2, textTransform: 'uppercase', fontSize: 13, margin: 0 }}>Panel · Pagos</p>
          <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', margin: '4px 0' }}>
            {cola.length} {cola.length === 1 ? 'transferencia espera' : 'transferencias esperan'} revisión
          </h1>
        </div>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/parrilla" style={{ color: c.texto_suave }}>Parrilla</Link>
          <Link href="/conversaciones" style={{ color: c.texto_suave }}>Conversaciones</Link>
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
      <p style={{ color: c.texto_suave, fontSize: 14 }}>
        Confirma en el banco que llegó el monto con la referencia indicada antes de aprobar. Los pagos con pasarela se confirman solos con el aviso firmado.
        Cada decisión queda en la bitácora.
      </p>

      {cola.length === 0 && <p style={{ background: c.superficie, padding: 20, borderRadius: 8 }}>No hay transferencias pendientes.</p>}

      <div style={{ display: 'grid', gap: 16 }}>
        {cola.map((t) => (
          <article key={t.id} style={{ background: c.superficie, borderRadius: 10, padding: 20, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: 'Oswald, Impact, sans-serif', fontSize: 24 }}>{t.empresa}</h2>
                <span style={{ color: c.texto_suave, fontSize: 14 }}>
                  Pedido {t.pedidoId.slice(0, 8)} · enviado {fecha(t.creadoAt)} · la reserva vencía {fecha(t.reservaVenceAt)}
                </span>
              </div>
              <strong style={{ fontFamily: 'Oswald, Impact, sans-serif', fontSize: 28 }}>{dinero(t.montoCentimos, t.moneda)}</strong>
            </div>
            <p style={{ margin: 0 }}>
              Referencia: <strong>{t.referencia ?? '—'}</strong> ·{' '}
              <a href={`/pagos/${t.id}/comprobante`} target="_blank" rel="noreferrer" style={{ color: c.acento }}>
                Ver comprobante ({t.comprobanteNombre ?? 'archivo'})
              </a>
            </p>
            <form action={decidirPago} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="hidden" name="id" value={t.id} />
              <input
                name="motivo"
                aria-label="Motivo para el cliente (obligatorio al rechazar)"
                placeholder="Motivo para el cliente (obligatorio al rechazar)"
                maxLength={1000}
                style={{ flex: '1 1 320px', background: c.fondo, color: c.texto, border: `1px solid ${c.texto_suave}`, borderRadius: 6, padding: '8px 10px' }}
              />
              <button name="decision" value="aprobar" type="submit" style={{ ...boton, background: c.acento, color: c.fondo }}>
                Aprobar pago
              </button>
              <button name="decision" value="rechazar" type="submit" style={{ ...boton, background: 'transparent', color: c.texto, border: `1px solid ${c.texto_suave}` }}>
                Rechazar
              </button>
            </form>
          </article>
        ))}
      </div>
    </main>
  );
}
