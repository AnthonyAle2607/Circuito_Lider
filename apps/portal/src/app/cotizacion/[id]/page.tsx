import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cotizacion } from '@sp/schemas';
import { reservar } from '../../acciones';
import { dinero, fechaCorta } from '@/lib/fechas';
import { api, sesionActual } from '@/lib/sesion';
import { TERMINOS_VERSION } from '@/lib/terminos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tu cotización · Invermedia Radio', robots: { index: false } };

const ESTADO: Record<string, string> = {
  vigente: 'Vigente',
  en_aprobacion: 'En revisión de ventas',
  rechazada: 'No aprobada',
  reservada: 'Reservada',
  vencida: 'Vencida',
};

export default async function VerCotizacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await api(`/v1/cotizaciones/${id}`);
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error('No se pudo leer la cotización');
  const c = Cotizacion.parse(r.datos);
  const conSesion = Boolean(await sesionActual());
  const vence = new Date(c.venceAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });
  const reservable = c.estado === 'vigente';
  const volver = `/cotizacion/${c.id}`;

  return (
    <main className="pagina">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <span className="label">Cotización · {c.id.slice(0, 8)}</span>
        <h1>Tu pauta</h1>
        <p className="intro">
          <span className={`estado ${c.estado}`}>{ESTADO[c.estado]}</span> · Precio garantizado hasta el {vence} (hora de Venezuela) · Spot de {c.duracionSegundos} s
        </p>
        {c.esEjemplo && <div className="aviso ejemplo">Precios de ejemplo: todavía no es el tarifario real de Circuito Líder.</div>}
        {q.error && <div className="aviso error" role="alert">{q.error}</div>}

        <div className="tarjeta">
          <div className="tabla-caja">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Programa</th>
                  <th>Dónde</th>
                  <th>Hora</th>
                  <th className="num">Precio</th>
                </tr>
              </thead>
              <tbody>
                {c.lineas.map((l) => (
                  <tr key={`${l.franjaId}-${l.fecha}`}>
                    <td>{fechaCorta(l.fecha)}</td>
                    <td>{l.programa}</td>
                    <td>{l.donde}</td>
                    <td>
                      {l.inicio}–{l.fin === '24:00' ? '00:00' : l.fin}
                    </td>
                    <td className="num">{dinero(l.precioCentimos, c.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totales">
            <div>
              <span>{c.emisiones} emisiones</span>
              <span>{dinero(c.subtotalCentimos, c.moneda)}</span>
            </div>
            {c.descuentoCentimos > 0 && (
              <div>
                <span>Descuento por volumen ({c.descuentoBps / 100} %)</span>
                <span>−{dinero(c.descuentoCentimos, c.moneda)}</span>
              </div>
            )}
            <div className="gran">
              <span>Total</span>
              <span>{dinero(c.totalCentimos, c.moneda)}</span>
            </div>
          </div>
        </div>

        {reservable && (
          <form action={reservar} className="tarjeta">
            <input type="hidden" name="cotizacion" value={c.id} />
            <input type="hidden" name="terminos" value={TERMINOS_VERSION} />
            <h2 style={{ fontSize: 32 }}>Reservar los espacios</h2>
            <p style={{ color: 'var(--soft)' }}>Los retenemos para ti mientras pagas. Luego subes tu spot y una persona lo revisa.</p>
            <label className="marca-chk" htmlFor="acepta">
              <input type="checkbox" id="acepta" name="acepta" required />
              <span>
                Acepto los <Link href="/legal/terminos" target="_blank" style={{ textDecoration: 'underline' }}>términos de la pauta</Link> (versión {TERMINOS_VERSION}).
              </span>
            </label>
            <div className="acciones">
              {conSesion ? (
                <button className="btn primary" type="submit">
                  Reservar <span className="arrow">→</span>
                </button>
              ) : (
                <>
                  <Link className="btn primary" href={`/registro?siguiente=${encodeURIComponent(volver)}`}>
                    Crear cuenta para reservar <span className="arrow">→</span>
                  </Link>
                  <Link href={`/ingresar?siguiente=${encodeURIComponent(volver)}`}>Ya tengo cuenta</Link>
                </>
              )}
            </div>
          </form>
        )}
        {c.estado === 'en_aprobacion' && (
          <div className="aviso ok">Por su tamaño, esta pauta la revisa una persona de ventas antes de reservarla. Vuelve a este enlace: cuando esté aprobada podrás reservar.</div>
        )}
        {(c.estado === 'vencida' || c.estado === 'rechazada') && (
          <div className="acciones">
            <Link className="btn primary" href="/#cotizar">
              Cotizar de nuevo <span className="arrow">→</span>
            </Link>
          </div>
        )}
        {c.estado === 'reservada' && (
          <div className="acciones">
            <Link className="btn primary" href="/cuenta">
              Ver mis pedidos <span className="arrow">→</span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
