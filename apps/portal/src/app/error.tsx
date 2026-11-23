'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Si algo falla al cargar una página (la API no responde, por ejemplo), se explica y se ofrece reintentar. */
export default function ErrorDePagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="pagina">
      <div className="wrap angosta">
        <span className="label">Sin señal</span>
        <h1>No pudimos cargar esta página</h1>
        <p className="intro">Puede ser una falla momentánea de conexión con nuestro servidor. Intenta de nuevo en unos segundos.</p>
        <div className="acciones">
          <button className="btn primary" type="button" onClick={reset}>
            Reintentar
          </button>
          <Link className="btn" href="/">
            Ir al inicio
          </Link>
        </div>
        {error.digest && <p className="nota">Código para soporte: {error.digest}</p>}
      </div>
    </main>
  );
}
