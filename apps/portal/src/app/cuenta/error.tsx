'use client';

import { useEffect } from 'react';

/** Un error en una sección del panel no tumba el menú: se avisa ahí mismo y se puede reintentar. */
export default function ErrorDelPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="tarjeta" role="alert">
      <h1 style={{ fontSize: 32 }}>No pudimos cargar esta sección</h1>
      <p>Intenta de nuevo en unos segundos. Si sigue fallando, escríbenos.</p>
      <div className="acciones">
        <button className="btn primary" type="button" onClick={reset}>
          Reintentar
        </button>
      </div>
      {error.digest && <p className="nota">Código para soporte: {error.digest}</p>}
    </div>
  );
}
