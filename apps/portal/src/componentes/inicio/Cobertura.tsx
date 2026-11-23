import Link from 'next/link';

/** Cobertura: el círculo de las diez emisoras (lo arma `efectos/circulo.ts`) junto al texto y dos acciones. */
export function Cobertura() {
  return (
    <section id="emisoras" className="seccion oscura cobertura">
      <div className="wrap cobertura-rejilla">
        <header className="encabezado">
          <span className="sobretitulo">Cobertura</span>
          <h2>
            Una compra. <em>Diez emisoras.</em>
          </h2>
          <p>
            Los programas en cadena nacional suenan en todo el circuito al mismo tiempo. Las franjas locales, solo donde las elijas. Arrastra
            el círculo para girarlo.
          </p>
          <div className="ctas">
            <a className="btn primary" href="#paquetes">
              Ver paquetes <span className="arrow">→</span>
            </a>
            <Link className="btn" href="/emisoras">
              Escuchar en vivo
            </Link>
          </div>
        </header>
        <div className="wheel" id="wheel" aria-label="Las diez emisoras de Circuito Líder">
          <div className="orbit" id="orbit" />
          <div className="dial" aria-hidden="true">
            <div className="face" />
            <div className="tk" id="ticks" />
            <div className="needle" />
            <div className="knob" />
            <span className="cnt">10 emisoras FM</span>
          </div>
        </div>
      </div>
    </section>
  );
}
