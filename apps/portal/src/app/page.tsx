import type { Parrilla } from '@sp/schemas';
import { Efectos } from '@/componentes/Efectos';
import { FINAL, HERO_REDACCION, HERO_TEXTO, MEDIO, TONO } from '@/componentes/marcado';
import { Buscador, Cotizador, Paquetes, Tienda, type DatosVenta } from '@/componentes/Venta';
import { emisoras, parrilla, tarifario } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Inicio con el diseño «Parrilla · Invermedia», simplificado con la tienda de la opción B (rediseño 2026-11-19):
 * héroe con buscador y redacción de agentes, tienda de programas con «Tu pauta», cómo funciona en una fila, cobertura,
 * paquetes, cotizador hora por hora con la radio sonando en el dial, por qué aquí, preguntas y cierre.
 */
export default async function Inicio() {
  const lista = await emisoras();
  const [parrillas, t] = await Promise.all([Promise.all(lista.map((e) => parrilla(e.slug))), tarifario()]);
  const datos: DatosVenta = {
    emisoras: lista,
    parrillas: Object.fromEntries(parrillas.filter((p): p is Parrilla => p !== null).map((p) => [p.emisora.slug, p])),
    tarifario: t,
  };
  const html = (h: string) => <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: h }} />;
  return (
    <>
      <main id="top">
        <section className="hero">
          <div className="wrap">
            {html(HERO_TEXTO)}
            <Buscador datos={datos} />
          </div>
          {html(HERO_REDACCION)}
        </section>
        <Tienda datos={datos} />
        {html(MEDIO)}
        <Paquetes datos={datos} />
        <Cotizador datos={datos} />
        {html(FINAL)}
      </main>
      <div dangerouslySetInnerHTML={{ __html: TONO }} />
      <Efectos />
    </>
  );
}
