import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ResumenPedido, Yo } from '@sp/schemas';
import { salir } from '../acciones';
import { dinero } from '@/lib/fechas';
import { api, exigirSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mis pedidos · Invermedia Radio', robots: { index: false } };

const ESTADOS: Record<string, string> = { reservado: 'Reservado · falta pagar', pagado: 'Pagado', cancelado: 'Cancelado', vencido: 'Vencido' };

export default async function Cuenta() {
  await exigirSesion('/cuenta');
  const [yo, pedidos] = await Promise.all([api('/v1/cuentas/yo', { conSesion: true }), api('/v1/pedidos', { conSesion: true })]);
  if (yo.status === 401 || pedidos.status === 401) redirect('/ingresar?siguiente=/cuenta');
  const y = Yo.parse(yo.datos);
  const lista = ResumenPedido.array().parse(pedidos.datos);

  return (
    <main className="pagina">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <span className="label">{y.anunciante.empresa}</span>
        <h1>Mis pedidos</h1>
        <p className="intro">Hola, {y.usuario.nombre}.</p>
        {!y.usuario.correoVerificado && (
          <div className="aviso ejemplo">Confirma tu correo con el enlace que te enviamos: lo necesitas para reservar.</div>
        )}
        {lista.length === 0 ? (
          <div className="tarjeta">
            <p style={{ marginTop: 0 }}>Todavía no tienes pedidos.</p>
            <Link className="btn primary" href="/#cotizar">
              Cotizar mi pauta <span className="arrow">→</span>
            </Link>
          </div>
        ) : (
          <div className="lista-pedidos">
            {lista.map((p) => (
              <Link key={p.id} href={`/cuenta/pedidos/${p.id}`} className="tarjeta">
                <span>
                  <span className="label">Pedido {p.id.slice(0, 8)}</span>
                  <br />
                  <b>{p.emisiones} emisiones</b> · {dinero(p.totalCentimos, p.moneda)}
                </span>
                <span className={`estado ${p.estado}`}>{ESTADOS[p.estado]}</span>
              </Link>
            ))}
          </div>
        )}
        <form action={salir} className="acciones">
          <button className="btn" type="submit">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
