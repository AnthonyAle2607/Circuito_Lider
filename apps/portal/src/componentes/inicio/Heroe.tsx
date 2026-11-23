import type { ReactNode } from 'react';

/**
 * Héroe oscuro de marca: tablero «al aire», titular con la única cinta naranja del sitio, buscador (lo pasa la
 * portada) y la redacción de agentes que dibuja `efectos/redaccion.ts` dentro del SVG vacío.
 */
export function Heroe({ buscador }: { buscador: ReactNode }) {
  return (
    <section className="hero oscura">
      <div className="wrap">
        <span className="onair">
          <i aria-hidden="true" />
          <span id="liveNow">Al aire</span>
        </span>
        <h1>
          Tu anuncio en <span className="tape">10&nbsp;radios</span> de Venezuela
        </h1>
        <p className="lead">
          Invermedia pone tu marca en las diez emisoras de Circuito Líder. Eliges la hora, subes tu spot y pagas en línea desde cualquier
          país. Te enviamos la prueba de cada emisión.
        </p>
        {buscador}
      </div>
      <svg
        className="newsroom"
        id="newsroom"
        viewBox="0 0 1200 660"
        role="img"
        aria-label="Redacción de radio con diez agentes, cada uno en su emisora: Caracas, Valencia, Maracaibo, Barquisimeto, Mérida, San Cristóbal, El Vigía, Puerto Ordaz, Puerto La Cruz y Margarita"
      />
    </section>
  );
}
