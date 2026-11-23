/** Marcado del chat de Toño. El dibujo y el comportamiento los pone `efectos/tono.ts`. */
export function Tono() {
  return (
    <div className="sup" id="sup">
      <div className="panel" id="panel" role="dialog" aria-label="Chat de soporte con Toño" hidden>
        <div className="ph">
          <span className="mini" id="tonoMini" aria-hidden="true" />
          <div>
            <b>Toño</b>
            <span id="tst">Soporte Invermedia · en línea</span>
          </div>
          <button className="x" id="tclose" type="button" aria-label="Cerrar el chat">
            ×
          </button>
        </div>
        <div className="pm" id="pm" aria-live="polite" />
        <div className="pq" id="pq" />
        <form className="pf" id="pf">
          <input id="pin" autoComplete="off" placeholder="Escríbele a Toño…" aria-label="Tu mensaje" />
          <button aria-label="Enviar">➤</button>
        </form>
        <div className="pnote">Respuestas automáticas · pronto con el agente de ventas</div>
      </div>
      <div className="teaser" id="teaser">
        ¿Te ayudo con tu pauta? 📻
      </div>
      <button className="sup-btn" id="supBtn" type="button" aria-expanded="false" aria-controls="panel" aria-label="Abrir el chat de soporte con Toño">
        <span className="dot" aria-hidden="true" />
      </button>
    </div>
  );
}
