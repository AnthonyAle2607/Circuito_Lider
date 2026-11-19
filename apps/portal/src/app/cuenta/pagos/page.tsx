import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ResumenPedido } from '@sp/schemas';
import { dinero, fechaCorta } from '@/lib/fechas';
import { api } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagos · Invermedia Radio', robots: { index: false } };

const hora = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });

export default async function Pagos() {
  const r = await api('/v1/pedidos', { conSesion: true });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/pagos');
  const lista = ResumenPedido.array().parse(r.datos);
  const pendientes = lista.filter((p) => p.estado === 'reservado');
  const pagados = lista.filter((p) => p.estado === 'pagado');

  return (
    <>
      <h1>Pagos</h1>
      <p className="intro">Lo que falta pagar para confirmar tus espacios y lo que ya pagaste.</p>
      <div className="aviso ok">
        El pago en línea se está habilitando. Mientras tanto, tus espacios quedan retenidos hasta la hora indicada y, si no se pagan, se liberan solos.
      </div>

      <h2 className="sub">Por pagar</h2>
      {pendientes.length === 0 ? (
        <p className="nota">No tienes pagos pendientes.</p>
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
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/cuenta/pedidos/${p.id}`}>Pedido {p.id.slice(0, 8)}</Link>
                    </td>
                    <td>{p.emisiones}</td>
                    <td>{hora(p.reservaVenceAt)}</td>
                    <td className="num">{dinero(p.totalCentimos, p.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="sub">Pagados</h2>
      {pagados.length === 0 ? (
        <p className="nota">Todavía no hay pagos registrados.</p>
      ) : (
        <div className="lista-pedidos">
          {pagados.map((p) => (
            <Link key={p.id} href={`/cuenta/pedidos/${p.id}`} className="tarjeta">
              <span>
                <span className="label">
                  Pedido {p.id.slice(0, 8)} · {fechaCorta(p.creadoAt.slice(0, 10))}
                </span>
                <br />
                <b>{dinero(p.totalCentimos, p.moneda)}</b>
              </span>
              <span className="estado pagado">Pagado</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
