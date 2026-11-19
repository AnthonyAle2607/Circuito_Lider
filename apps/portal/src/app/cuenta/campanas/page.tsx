import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ResumenPedido } from '@sp/schemas';
import { dinero, fechaCorta } from '@/lib/fechas';
import { api } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campañas · Invermedia Radio', robots: { index: false } };

const ESTADOS_PEDIDO: Record<string, string> = { reservado: 'Reservado · falta pagar', pagado: 'Pagado', cancelado: 'Cancelado', vencido: 'Vencido' };

export default async function Campanas() {
  const r = await api('/v1/pedidos', { conSesion: true });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/campanas');
  const lista = ResumenPedido.array().parse(r.datos);
  const enCurso = lista.filter((p) => p.estado === 'reservado' || p.estado === 'pagado');
  const cerradas = lista.filter((p) => p.estado !== 'reservado' && p.estado !== 'pagado');

  const fila = (p: (typeof lista)[number]) => (
    <Link key={p.id} href={`/cuenta/pedidos/${p.id}`} className="tarjeta">
      <span>
        <span className="label">
          Pedido {p.id.slice(0, 8)} · {fechaCorta(p.creadoAt.slice(0, 10))}
        </span>
        <br />
        <b>{p.emisiones} emisiones</b> · {dinero(p.totalCentimos, p.moneda)}
      </span>
      <span className={`estado ${p.estado}`}>{ESTADOS_PEDIDO[p.estado]}</span>
    </Link>
  );

  return (
    <>
      <h1>Campañas</h1>
      <p className="intro">Cada reserva es una campaña. Entra a una para ver sus emisiones, su avance o cancelarla.</p>
      {lista.length === 0 ? (
        <div className="tarjeta vacio">
          <p>Todavía no tienes campañas.</p>
          <Link className="btn primary" href="/#cotizar">
            Cotizar mi pauta <span className="arrow">→</span>
          </Link>
        </div>
      ) : (
        <>
          <h2 className="sub">En curso</h2>
          {enCurso.length ? <div className="lista-pedidos">{enCurso.map(fila)}</div> : <p className="nota">Ninguna en curso.</p>}
          {cerradas.length > 0 && (
            <>
              <h2 className="sub">Anteriores</h2>
              <div className="lista-pedidos">{cerradas.map(fila)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}
