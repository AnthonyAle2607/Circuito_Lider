import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Cotizacion, Pedido } from '@sp/schemas';
import { cancelarPedido } from '../../../acciones';
import { dinero, fechaCorta } from '@/lib/fechas';
import { api, exigirSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pedido · Invermedia Radio', robots: { index: false } };

const ESTADOS: Record<string, string> = { reservado: 'Reservado · falta pagar', pagado: 'Pagado', cancelado: 'Cancelado', vencido: 'Vencido' };

/** Los pasos del pedido. En PT-4 llegan hasta la reserva; pago, spot y emisiones se encienden en sus PT. */
const PASOS = ['Reservado', 'Pagado', 'Spot aprobado', 'Programado', 'Al aire', 'Certificado'];

export default async function VerPedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string; error?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await exigirSesion(`/cuenta/pedidos/${id}`);
  const r = await api(`/v1/pedidos/${id}`, { conSesion: true });
  if (r.status === 401) redirect(`/ingresar?siguiente=/cuenta/pedidos/${id}`);
  if (r.status === 404) notFound();
  const p = Pedido.parse(r.datos);
  const c = Cotizacion.parse((await api(`/v1/cotizaciones/${p.cotizacionId}`)).datos);
  const vence = new Date(p.reservaVenceAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });
  const hecho = p.estado === 'pagado' ? 2 : p.estado === 'reservado' ? 1 : 0;

  return (
    <main className="pagina">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <span className="label">
          <Link href="/cuenta">← Mis pedidos</Link> · Pedido {p.id.slice(0, 8)}
        </span>
        <h1>{q.nuevo ? '¡Reservado!' : 'Tu pedido'}</h1>
        <p className="intro">
          <span className={`estado ${p.estado}`}>{ESTADOS[p.estado]}</span> · {dinero(p.totalCentimos, p.moneda)} · {p.reservas.length} emisiones de {c.duracionSegundos} s
        </p>
        {q.error && <div className="aviso error" role="alert">{q.error}</div>}
        {p.estado === 'reservado' && (
          <div className="aviso ejemplo">
            Tus espacios están retenidos hasta el {vence} (hora de Venezuela). El pago en línea llega en la siguiente etapa; si no se paga a tiempo, se liberan
            solos.
          </div>
        )}

        <ol className="tarjeta" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: '0 0 16px', padding: 16 }} aria-label="Avance del pedido">
          {PASOS.map((paso, i) => (
            <li key={paso} className={`estado ${i < hecho ? 'reservado' : ''}`} aria-current={i === hecho - 1 ? 'step' : undefined}>
              {i < hecho ? '✓ ' : ''}
              {paso}
            </li>
          ))}
        </ol>

        <div className="tarjeta">
          <div className="tabla-caja">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Programa</th>
                  <th>Dónde</th>
                  <th>Hora</th>
                  <th>Espacio</th>
                </tr>
              </thead>
              <tbody>
                {c.lineas.map((l) => {
                  const res = p.reservas.find((x) => x.franjaId === l.franjaId && x.fecha === l.fecha);
                  return (
                    <tr key={`${l.franjaId}-${l.fecha}`}>
                      <td>{fechaCorta(l.fecha)}</td>
                      <td>{l.programa}</td>
                      <td>{l.donde}</td>
                      <td>
                        {l.inicio}–{l.fin === '24:00' ? '00:00' : l.fin}
                      </td>
                      <td>{res?.estado === 'retenida' ? 'Retenido' : res?.estado === 'confirmada' ? 'Confirmado' : 'Liberado'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {p.estado === 'reservado' && (
          <form action={cancelarPedido} className="acciones">
            <input type="hidden" name="pedido" value={p.id} />
            <button className="btn" type="submit">
              Cancelar y liberar los espacios
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
