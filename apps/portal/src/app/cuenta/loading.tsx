/** Dentro del panel: el menú se queda y solo el contenido muestra la espera. */
export default function CargandoPanel() {
  return (
    <div className="cargando" aria-busy="true" aria-live="polite">
      <span className="onda" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <p>Cargando tu panel…</p>
    </div>
  );
}
