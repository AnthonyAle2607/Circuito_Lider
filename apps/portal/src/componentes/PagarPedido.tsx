import type { DatosTransferencia, Pedido } from '@sp/schemas';
import { enviarComprobante, pagarEnLinea } from '@/app/acciones-pagos';
import { dinero } from '@/lib/fechas';
import { RefrescoMientrasProcesa } from './SubirAnuncio';

const hora = (iso: string) => new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Cómo pagar un pedido reservado (PT-5): en línea por la pasarela (camino principal) o por transferencia con
 * comprobante. Muestra también el estado del último intento: confirmando, en revisión o rechazado con su motivo.
 */
export function PagarPedido({ pedido: p, banco, volvioDePagar }: { pedido: Pedido; banco: DatosTransferencia | null; volvioDePagar: boolean }) {
  const ultimo = p.pagos[0];
  const enRevision = p.pagos.find((x) => x.metodo === 'transferencia' && x.estado === 'pendiente');
  const total = dinero(p.totalCentimos, p.moneda);

  if (p.estado === 'pagado') {
    const ok = p.pagos.find((x) => x.estado === 'aprobado');
    return (
      <div className="aviso ok" role="status">
        Pago recibido{ok?.confirmadoAt ? ` el ${hora(ok.confirmadoAt)}` : ''}: tus espacios quedaron confirmados.
      </div>
    );
  }
  if (p.estado !== 'reservado') return null;

  if (enRevision) {
    return (
      <div className="tarjeta pago">
        <h2 className="sub" style={{ marginTop: 0 }}>Comprobante en revisión</h2>
        <p style={{ margin: 0 }}>
          Recibimos tu transferencia con la referencia <b>{enRevision.referencia}</b>. Finanzas la confirma en horario laboral; mientras tanto tus espacios
          siguen retenidos aunque pase la hora límite.
        </p>
      </div>
    );
  }

  return (
    <section className="pago" aria-labelledby="pago-titulo">
      <h2 className="sub" id="pago-titulo">
        Paga {total} para confirmar tus espacios
      </h2>
      {volvioDePagar && (
        <div className="aviso ok" role="status">
          Estamos confirmando tu pago con la pasarela. Esta página se actualiza sola.
          <RefrescoMientrasProcesa activo />
        </div>
      )}
      {ultimo?.estado === 'rechazado' && (
        <div className="aviso error" role="alert">
          {ultimo.metodo === 'transferencia' ? `Tu transferencia no se pudo confirmar: ${ultimo.motivo ?? 'revisa los datos'}.` : 'La pasarela rechazó el pago. Prueba con otra tarjeta.'}
        </div>
      )}
      <div className="pago-opciones">
        <form action={pagarEnLinea} className="tarjeta pago-opcion">
          <input type="hidden" name="pedido" value={p.id} />
          <span className="label">Recomendado</span>
          <h3>Pagar en línea</h3>
          <p className="nota">Tarjeta en la página segura de la pasarela. Se confirma al instante; nunca vemos los datos de tu tarjeta.</p>
          <button className="btn primary" type="submit">
            Pagar {total} <span className="arrow">→</span>
          </button>
        </form>
        {banco && (
          <form action={enviarComprobante} className="tarjeta pago-opcion">
            <input type="hidden" name="pedido" value={p.id} />
            <span className="label">Transferencia{banco.esEjemplo && <> · <span className="ex">datos de ejemplo</span></>}</span>
            <h3>Pagar por banco</h3>
            <dl className="datos-banco">
              <dt>Titular</dt>
              <dd>{banco.titular}</dd>
              <dt>Banco</dt>
              <dd>{banco.banco}</dd>
              <dt>Cuenta</dt>
              <dd>{banco.cuenta}</dd>
              <dt>Monto</dt>
              <dd>{total}</dd>
              <dt>Concepto</dt>
              <dd>Pedido {p.id.slice(0, 8)}</dd>
            </dl>
            <p className="nota">{banco.nota}</p>
            <label className="campo">
              <span>Referencia de la transferencia</span>
              <input name="referencia" required minLength={3} maxLength={100} autoComplete="off" />
            </label>
            <label className="campo">
              <span>Comprobante (PDF, PNG o JPG)</span>
              <input name="archivo" type="file" required accept="application/pdf,image/png,image/jpeg" />
            </label>
            <button className="btn" type="submit">
              Enviar comprobante
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
