import type { Parrilla } from '@sp/schemas';
import { Efectos } from '@/componentes/animacion';
import { Cierre, Cobertura, ComoFunciona, Heroe, Tono } from '@/componentes/inicio';
import { Buscador, Cotizador, Paquetes, Tienda, type DatosVenta } from '@/componentes/venta';
import { emisoras, parrilla, tarifario } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Portada. Alterna secciones oscuras de marca y claras para comprar (ver docs/diseno-portal.md):
 * héroe (oscuro) → tienda → cómo funciona → cobertura (oscuro) → paquetes → cotizador (oscuro) → por qué, preguntas
 * → cierre (oscuro). Los efectos decorativos se arrancan en <Efectos /> y se apagan al salir.
 */
export default async function Inicio() {
  const lista = await emisoras();
  const [parrillas, t] = await Promise.all([Promise.all(lista.map((e) => parrilla(e.slug))), tarifario()]);
  const datos: DatosVenta = {
    emisoras: lista,
    parrillas: Object.fromEntries(parrillas.filter((p): p is Parrilla => p !== null).map((p) => [p.emisora.slug, p])),
    tarifario: t,
  };
  return (
    <>
      <main id="top">
        <Heroe buscador={<Buscador datos={datos} />} />
        <Tienda datos={datos} />
        <ComoFunciona />
        <Cobertura />
        <Paquetes datos={datos} />
        <Cotizador datos={datos} />
        <Cierre />
      </main>
      <Tono />
      <Efectos />
    </>
  );
}
