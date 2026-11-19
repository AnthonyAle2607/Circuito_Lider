import Link from 'next/link';

/** La cabecera del diseño. El acceso a la cuenta queda fuera del menú para que se vea también en teléfonos. */
export function Cabecera({ conSesion }: { conSesion: boolean }) {
  return (
    <header className="top">
      <div className="wrap">
        <Link className="logo" href="/" aria-label="Invermedia Radio, inicio">
          <span className="imark" aria-hidden="true">
            INVR
            <br />
            MDIA
          </span>
          <span className="isub">Radio</span>
        </Link>
        <nav className="main" aria-label="Secciones">
          <Link href="/#como">Cómo funciona</Link>
          <Link href="/#paquetes">Paquetes</Link>
          <Link href="/emisoras">Emisoras en vivo</Link>
          <Link href="/parrilla">Parrilla</Link>
        </nav>
        <div className="acceso-top">
          {conSesion ? (
            <Link className="btn" href="/cuenta">
              Mi panel
            </Link>
          ) : (
            <>
              <Link className="entrar" href="/ingresar">
                Ingresar
              </Link>
              <Link className="btn crear" href="/registro">
                Crear cuenta
              </Link>
            </>
          )}
          <Link className="btn primary" href="/#cotizar">
            <span className="solo-ancho">Cotizar mi pauta</span>
            <span className="solo-corto">Cotizar</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
