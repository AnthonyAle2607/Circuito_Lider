import { TERMINOS_VERSION } from '@/lib/terminos';

export const metadata = { title: 'Términos · Invermedia Radio' };

export default function Terminos() {
  return (
    <main className="pagina">
      <div className="wrap" style={{ maxWidth: 760 }}>
        <span className="label">Versión {TERMINOS_VERSION}</span>
        <h1>Términos de la pauta</h1>
        <div className="aviso ejemplo">Borrador. El texto definitivo lo entrega Invermedia (contrato modelo pendiente).</div>
        <div className="tarjeta">
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
            <li>La reserva retiene los espacios elegidos por un plazo limitado. Si no se paga a tiempo, los espacios se liberan solos.</li>
            <li>El precio de una cotización vale hasta la fecha que indica y no cambia aunque cambie el tarifario.</li>
            <li>El comercial debe durar lo contratado y cumplir la normativa venezolana de radio. Una persona lo revisa antes de programarlo y puede pedir cambios.</li>
            <li>Las horas son de Venezuela (UTC−4). La emisión puede moverse dentro de la tanda comercial de la franja.</li>
            <li>Cada emisión queda registrada y al cerrar la campaña se entrega un certificado de transmisión.</li>
            <li>Un pedido sin pagar se puede cancelar desde la cuenta. Las condiciones de cambios y reembolsos de pedidos pagados se definen en el contrato.</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
