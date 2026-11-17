import type { Parrilla } from '@sp/schemas';
import { Efectos } from '@/componentes/Efectos';
import { ANTES_DE_VENTA, DESPUES_DE_VENTA, TONO } from '@/componentes/marcado';
import { Venta, type DatosVenta } from '@/componentes/Venta';
import { emisoras, parrilla, tarifario } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Inicio con el diseño «Parrilla · Invermedia». La decoración se conserva tal cual (marcado + efectos); paquetes y
 * cotizador trabajan sobre la parrilla y el tarifario reales.
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
        <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: ANTES_DE_VENTA }} />
        <Venta datos={datos} />
        <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: DESPUES_DE_VENTA }} />
      </main>
      <div dangerouslySetInnerHTML={{ __html: TONO }} />
      <Efectos />
    </>
  );
}
