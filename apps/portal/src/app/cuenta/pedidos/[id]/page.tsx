import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Anuncio, Certificado, Cotizacion, DatosTransferencia, Pedido } from '@sp/schemas';
import { asignarAnuncio, cancelarPedido } from '../../../acciones';
import { PagarPedido } from '@/componentes/PagarPedido';
import { dinero, fechaCorta } from '@/lib/fechas';
import { api, exigirSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pedido · Invermedia Radio', robots: { index: false } };

const ESTADOS: Record<string, string> = { reservado: 'Reservado · falta pagar', pagado: 'Pagado', cancelado: 'Cancelado', vencido: 'Vencido' };

/** Los pasos del pedido, de la reserva al certificado. */
const PASOS = ['Reservado', 'Pagado', 'Spot aprobado', 'Programado', 'Al aire', 'Certificado'];

export default async function VerPedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string; error?: string; anuncio?: string; pago?: string }> }) {
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
  const [ra, rc, rb] = await Promise.all([
    api('/v1/anuncios', { conSesion: true }),
    api(`/v1/certificados?pedido=${p.id}`, { conSesion: true }),
    p.estado === 'reservado' ? api('/v1/pagos/transferencia', { conSesion: true }) : null,
  ]);
  const banco = rb?.ok ? DatosTransferencia.parse(rb.datos) : null;
  const anuncios = ra.ok ? Anuncio.array().parse(ra.datos) : [];
  const aprobados = anuncios.filter((a) => a.estado === 'aprobado');
  const asignado = anuncios.find((a) => a.id === p.anuncioId) ?? null;
  const certificados = rc.ok ? Certificado.array().parse(rc.datos) : [];
  const vigente = p.estado === 'reservado' || p.estado === 'pagado';
  // Pasos que ya se cumplen: reservado, pagado, spot asignado y aprobado, al aire y certificado.
  const listos = new Set<string>();
  if (vigente || p.estado === 'pagado') listos.add('Reservado');
  if (p.estado === 'pagado') listos.add('Pagado');
  if (asignado) listos.add('Spot aprobado');
  // Programado: programación cargó el spot en todas las emisoras donde suena (RF-22).
  if (p.programacion.ordenes > 0 && p.programacion.cargadas === p.programacion.ordenes) listos.add('Programado');
  if (certificados.length) ['Programado', 'Al aire', 'Certificado'].forEach((x) => listos.add(x));

  return (
    <>
      <div>
        <span className="label">
          <Link href="/cuenta/campanas">← Campañas</Link> · Pedido {p.id.slice(0, 8)}
        </span>
        <h1>{q.nuevo ? '¡Reservado!' : 'Tu pedido'}</h1>
        <p className="intro">
          <span className={`estado ${p.estado}`}>{ESTADOS[p.estado]}</span> · {dinero(p.totalCentimos, p.moneda)} · {p.reservas.length} emisiones de {c.duracionSegundos} s
        </p>
        {q.error && <div className="aviso error" role="alert">{q.error}</div>}
        {p.estado === 'reservado' && (
          <div className="aviso ejemplo">Tus espacios están retenidos hasta el {vence} (hora de Venezuela). Si no se pagan a tiempo, se liberan solos.</div>
        )}
        {q.pago === 'transferencia' && <div className="aviso ok" role="status">Recibimos tu comprobante. Te avisamos cuando finanzas lo confirme.</div>}
        {q.pago === 'cancelado' && p.estado === 'reservado' && <div className="aviso" role="status">No se completó el pago. Puedes intentarlo de nuevo cuando quieras.</div>}
        <PagarPedido pedido={p} banco={banco} volvioDePagar={q.pago === 'ok'} />

        <ol className="tarjeta" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: '0 0 16px', padding: 16 }} aria-label="Avance del pedido">
          {PASOS.map((paso) => (
            <li key={paso} className={`estado ${listos.has(paso) ? 'reservado' : ''}`}>
              {listos.has(paso) ? '✓ ' : ''}
              {paso}
            </li>
          ))}
        </ol>

        {q.anuncio && <div className="aviso ok" role="status">Listo: este es el anuncio que sonará en la campaña.</div>}
        <div className="tarjeta asignar-anuncio">
          <h2 className="sub" style={{ marginTop: 0 }}>Anuncio de esta campaña</h2>
          {asignado ? (
            <p style={{ margin: 0 }}>
              Sonará <b>{asignado.nombre}</b> ({asignado.formato.toUpperCase()}).{' '}
              {certificados.length > 0 && (
                <Link href="/cuenta/certificados">
                  {certificados.length} {certificados.length === 1 ? 'emisión certificada' : 'emisiones certificadas'} →
                </Link>
              )}
            </p>
          ) : (
            <p style={{ margin: 0 }}>Elige qué anuncio suena. Así sabremos qué buscar en la grabación de cada emisora para certificarlo.</p>
          )}
          {vigente && aprobados.length > 0 && (
            <form action={asignarAnuncio} className="acciones">
              <input type="hidden" name="pedido" value={p.id} />
              <label className="campo" style={{ margin: 0, flex: '1 1 260px' }}>
                <span className="label">{asignado ? 'Cambiar por' : 'Anuncio aprobado'}</span>
                <select name="anuncio" defaultValue={asignado?.id ?? aprobados[0]!.id}>
                  {aprobados.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn primary" type="submit">
                {asignado ? 'Cambiar anuncio' : 'Usar este anuncio'}
              </button>
            </form>
          )}
          {vigente && aprobados.length === 0 && (
            <p className="nota" style={{ marginBottom: 0 }}>
              Todavía no tienes anuncios aprobados. <Link href="/cuenta/anuncios">Sube uno aquí</Link>.
            </p>
          )}
        </div>

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
    </>
  );
}
