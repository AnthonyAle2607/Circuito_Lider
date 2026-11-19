import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ResumenPanel, Yo } from '@sp/schemas';
import { dinero, fechaCorta } from '@/lib/fechas';
import { api } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi panel · Invermedia Radio', robots: { index: false } };

export default async function Resumen() {
  const [yo, res] = await Promise.all([api('/v1/cuentas/yo', { conSesion: true }), api('/v1/cuentas/resumen', { conSesion: true })]);
  if (yo.status === 401 || res.status === 401) redirect('/ingresar?siguiente=/cuenta');
  const y = Yo.parse(yo.datos);
  const s = ResumenPanel.parse(res.datos);
  const vence = s.porPagar.venceAt
    ? new Date(s.porPagar.venceAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <>
      <h1>Hola, {y.usuario.nombre.split(' ')[0]}</h1>
      <p className="intro">Aquí ves tus campañas, lo que falta pagar y cuándo suena tu próximo anuncio.</p>

      <div className="cifras">
        <Link href="/cuenta/campanas" className="tarjeta cifra">
          <span className="label">Campañas en curso</span>
          <b>{s.campanasActivas}</b>
        </Link>
        <Link href="/cuenta/campanas" className="tarjeta cifra">
          <span className="label">Emisiones por sonar</span>
          <b>{s.emisionesPorSonar}</b>
        </Link>
        <Link href="/cuenta/pagos" className={`tarjeta cifra${s.porPagar.pedidos ? ' alerta' : ''}`}>
          <span className="label">Por pagar</span>
          <b>{s.porPagar.pedidos ? dinero(s.porPagar.totalCentimos, s.porPagar.moneda ?? 'USD') : '—'}</b>
          {vence && <small>Antes del {vence}</small>}
        </Link>
      </div>

      <h2 className="sub">Próximas emisiones</h2>
      {s.proximas.length === 0 ? (
        <div className="tarjeta vacio">
          <p>Todavía no tienes emisiones programadas.</p>
          <Link className="btn primary" href="/#cotizar">
            Cotizar mi pauta <span className="arrow">→</span>
          </Link>
        </div>
      ) : (
        <div className="tarjeta">
          <div className="tabla-caja">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Programa</th>
                  <th>Dónde</th>
                  <th>Espacio</th>
                </tr>
              </thead>
              <tbody>
                {s.proximas.map((e) => (
                  <tr key={`${e.pedidoId}-${e.fecha}-${e.inicio}-${e.programa}`}>
                    <td>
                      <Link href={`/cuenta/pedidos/${e.pedidoId}`}>{fechaCorta(e.fecha)}</Link>
                    </td>
                    <td>
                      {e.inicio}–{e.fin === '24:00' ? '00:00' : e.fin}
                    </td>
                    <td>{e.programa}</td>
                    <td>{e.donde}</td>
                    <td>{e.estado === 'confirmada' ? 'Confirmado' : 'Retenido'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="sub">Atajos</h2>
      <div className="atajos">
        <Link className="tarjeta" href="/#cotizar">
          <b>Nueva campaña</b>
          <span>Elige emisoras y horas en la parrilla.</span>
        </Link>
        <Link className="tarjeta" href="/cuenta/anuncios">
          <b>Mis anuncios</b>
          <span>Tus spots y su revisión.</span>
        </Link>
        <Link className="tarjeta" href="/cuenta/empresa">
          <b>Datos de la empresa</b>
          <span>{y.anunciante.idFiscal ? 'Revisa o corrige tus datos.' : 'Completa tus datos de facturación.'}</span>
        </Link>
      </div>
    </>
  );
}
