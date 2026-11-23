import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pago, ResumenPedido } from '@sp/schemas';
import { dinero } from '@/lib/fechas';
import { api } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagos · Invermedia Radio', robots: { index: false } };

const hora = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });
const ESTADO: Record<Pago['estado'], string> = { pendiente: 'En proceso', aprobado: 'Aprobado', rechazado: 'Rechazado', expirado: 'Sin completar' };
const CLASE: Record<Pago['estado'], string> = { pendiente: '', aprobado: 'pagado', rechazado: 'rechazada', expirado: 'vencido' };

/** Lo que falta pagar (con acceso directo a pagar) y el historial de cada intento de pago. */
export default async function Pagos() {
  const [rp, rg] = await Promise.all([api('/v1/pedidos', { conSesion: true }), api('/v1/pagos', { conSesion: true })]);
  if (rp.status === 401) redirect('/ingresar?siguiente=/cuenta/pagos');
  const pendientes = ResumenPedido.array().parse(rp.datos).filter((p) => p.estado === 'reservado');
  const pagos = rg.ok ? Pago.array().parse(rg.datos) : [];

  return (
    <>
      <h1>Pagos</h1>
      <p className="intro">Paga en línea con tarjeta o por transferencia. Tus espacios quedan retenidos hasta la hora indicada; si no se pagan, se liberan solos.</p>

      <h2 className="sub">Por pagar</h2>
      {pendientes.length === 0 ? (
        <p className="nota">
          No tienes pagos pendientes. <Link href="/#espacios">Arma una pauta nueva</Link>.
        </p>
      ) : (
        <div className="tarjeta">
          <div className="tabla-caja">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Emisiones</th>
                  <th>Retenido hasta</th>
                  <th className="num">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.id}>
                    <td>Pedido {p.id.slice(0, 8)}</td>
                    <td>{p.emisiones}</td>
                    <td>{hora(p.reservaVenceAt)}</td>
                    <td className="num">{dinero(p.totalCentimos, p.moneda)}</td>
                    <td className="num">
                      <Link className="btn primary" href={`/cuenta/pedidos/${p.id}#pago-titulo`}>
                        Pagar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="sub">Historial</h2>
      {pagos.length === 0 ? (
        <p className="nota">Todavía no hay pagos registrados.</p>
      ) : (
        <div className="tarjeta">
          <div className="tabla-caja">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Método</th>
                  <th>Estado</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((g) => (
                  <tr key={g.id}>
                    <td>{hora(g.creadoAt)}</td>
                    <td>
                      <Link href={`/cuenta/pedidos/${g.pedidoId}`}>{g.pedidoId.slice(0, 8)}</Link>
                    </td>
                    <td>{g.metodo === 'pasarela' ? 'En línea' : `Transferencia ${g.referencia ?? ''}`}</td>
                    <td>
                      <span className={`estado ${CLASE[g.estado]}`}>{ESTADO[g.estado]}</span>
                      {g.motivo && <small className="nota"> · {g.motivo}</small>}
                    </td>
                    <td className="num">{dinero(g.montoCentimos, g.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
