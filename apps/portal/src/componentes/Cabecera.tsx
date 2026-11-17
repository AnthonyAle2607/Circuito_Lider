import Link from 'next/link';

/** La cabecera del diseño, con acceso a la cuenta. */
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
          <Link href="/parrilla">Parrilla</Link>
          <Link href={conSesion ? '/cuenta' : '/ingresar'}>{conSesion ? 'Mis pedidos' : 'Ingresar'}</Link>
        </nav>
        <Link className="btn primary" href="/#cotizar">
          Cotizar mi pauta
        </Link>
      </div>
    </header>
  );
}
