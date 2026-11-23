'use client';

import { useEffect, useMemo, type MouseEvent } from 'react';
import { dinero } from '@/lib/fechas';
import { chispas } from '../animacion';
import { desdeCentimos, pasaFiltros, programasDe, type DatosVenta, type Programa } from './datos';
import { TarjetaPrograma } from './TarjetaPrograma';
import { TuPauta } from './TuPauta';
import { useCotizacion } from './useCotizacion';

/** La tienda: filtros, los programas como productos y «Tu pauta» al lado. */
export function Tienda({ datos }: { datos: DatosVenta }) {
  const c = useCotizacion(datos);
  const { p, t } = c;
  const programas = useMemo(() => programasDe(datos), [datos]);
  const ciudades = useMemo(() => datos.emisoras.filter((e) => programas.some((x) => x.emisora === e.slug)), [datos.emisoras, programas]);
  const visibles = programas.filter((x) => pasaFiltros(x, p.filtros));
  const enPauta = (x: Programa) => x.ids.filter((id) => p.elegidas.has(id)).length;

  const alternar = (x: Programa, ev: MouseEvent<HTMLButtonElement>) => {
    c.setError(null);
    const todas = enPauta(x) === x.ids.length;
    p.setElegidas((s) => {
      const n = new Set(s);
      for (const id of x.ids) (todas ? n.delete(id) : n.add(id));
      return n;
    });
    if (!todas) {
      const r = ev.currentTarget.getBoundingClientRect();
      chispas(ev.currentTarget, r.width / 2, r.height / 2);
    }
  };

  // Resumen por programa (lo que muestra «Tu pauta») y el contador de la cabecera.
  const resumen = programas
    .map((x) => ({ x, n: c.emisiones.filter((e) => x.ids.includes(e.franjaId)).length, parcial: enPauta(x) }))
    .filter((r) => r.parcial > 0);
  const { setProgramas } = p;
  useEffect(() => setProgramas(resumen.length), [resumen.length, setProgramas]);

  const desde = (x: Programa) => {
    const cents = desdeCentimos(t, x.alcance);
    return cents === null ? null : dinero(cents, t?.moneda);
  };
  const f = p.filtros;
  const chip = (activo: boolean, texto: string, accion: () => void) => (
    <button key={texto} type="button" className="filtro" aria-pressed={activo} onClick={accion}>
      {texto}
    </button>
  );
  const cuando = (valor: string, texto: string) => chip(f.cuando === valor, texto, () => p.setFiltros({ ...f, cuando: f.cuando === valor ? 'cualquiera' : valor }));

  return (
    <section id="espacios" className="seccion clara tienda">
      <div className="wrap">
        <header className="encabezado">
          <span className="sobretitulo">Dónde suena tu anuncio</span>
          <h2>
            Dentro de los programas que <em>ya escuchan</em>
          </h2>
          <p>Agrega programas a tu pauta y mira el precio al instante. Tu spot sale en la tanda comercial de la programación real.</p>
        </header>
        <div className="tienda-filtros" role="group" aria-label="Filtrar programas">
          {chip(f.donde === 'todo', 'Todos', () => p.setFiltros({ ...f, donde: 'todo' }))}
          {chip(f.donde === 'cadena', 'En cadena', () => p.setFiltros({ ...f, donde: 'cadena' }))}
          {ciudades.map((e) => chip(f.donde === e.slug, e.ciudad, () => p.setFiltros({ ...f, donde: e.slug })))}
          <span className="separador" aria-hidden="true" />
          {cuando('mananas', 'Mañanas')}
          {cuando('tardes', 'Tardes y noches')}
          {cuando('finde', 'Fin de semana')}
        </div>
        <div className="tienda-rejilla">
          <div className="productos">
            {visibles.length === 0 && <p className="nota">No hay programas con esos filtros. Prueba con «Todos».</p>}
            {visibles.map((x) => (
              <TarjetaPrograma key={x.clave} programa={x} desde={desde(x)} enPauta={enPauta(x)} alternar={(ev) => alternar(x, ev)} />
            ))}
          </div>
          <TuPauta c={c} resumen={resumen} />
        </div>
      </div>
    </section>
  );
}
