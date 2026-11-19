'use client';

/** Abre el diálogo de impresión del navegador, que también guarda como PDF. */
export function Imprimir() {
  return (
    <button className="btn primary" type="button" onClick={() => window.print()}>
      Descargar PDF <span className="arrow">→</span>
    </button>
  );
}
