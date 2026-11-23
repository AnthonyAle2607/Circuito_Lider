/** Mientras el servidor trae la parrilla, el tarifario o las emisoras: una espera breve con la marca, sin saltos. */
export default function Cargando() {
  return (
    <main className="pagina cargando" aria-busy="true" aria-live="polite">
      <div className="wrap">
        <span className="onda" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <p>Sintonizando…</p>
      </div>
    </main>
  );
}
