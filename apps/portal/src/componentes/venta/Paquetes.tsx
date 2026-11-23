'use client';

import { useMemo, useState } from 'react';
import { cotizar } from '@sp/pricing';
import { dinero } from '@/lib/fechas';
import { CARACAS_AEREA, CIUDADES, IMAGENES, type Imagen } from '@/lib/imagenes';
import { Foto } from '../Foto';
import { usePauta } from '../Pauta';
import { emisionesDe, indexar, irA, paquetes, type DatosVenta, type Paquete } from './datos';

/** Una foto por paquete: la ciudad, la región andina y el público de todo el país. */
const FOTO: Record<Paquete['clave'], Imagen> = { ciudad: CARACAS_AEREA, region: CIUDADES.merida ?? IMAGENES.microfonoEstudio, nacional: IMAGENES.publicoLuces };

/** Tres paquetes armados sobre la parrilla real; «Agregar a mi pauta» suma sus horarios a la selección. */
export function Paquetes({ datos }: { datos: DatosVenta }) {
  const p = usePauta();
  const franjas = useMemo(() => indexar(datos), [datos]);
  const t = datos.tarifario;
  const [mensual, setMensual] = useState(false);
  const planes = useMemo(() => paquetes(franjas), [franjas]);
  const semanas = mensual ? 4 : 1;

  const precio = (ids: string[]) => {
    if (!t) return null;
    const em = emisionesDe(new Set(ids), franjas, p.lunesOpciones[0]!, semanas);
    if (em.length === 0) return null;
    try {
      return cotizar(t, t.duraciones.includes(30) ? 30 : t.duraciones[0]!, em);
    } catch {
      return null;
    }
  };
  const agregar = (ids: string[]) => {
    p.setElegidas((s) => new Set([...s, ...ids]));
    p.setSemanas(semanas);
    p.setFiltros({ donde: 'todo', cuando: 'cualquiera' });
    irA('espacios');
  };

  return (
    <section id="paquetes" className="seccion clara">
      <div className="wrap">
        <header className="encabezado centrado">
          <span className="sobretitulo">Paquetes</span>
          <h2>
            Empieza con un paquete, <em>ajústalo a tu medida</em>
          </h2>
          <p>Armados sobre la programación real del circuito. Incluyen revisión del spot, seguimiento y certificado.{t?.esEjemplo && ' Precios de ejemplo.'}</p>
        </header>
        <div className="conmutador" role="group" aria-label="Duración de la campaña">
          <button type="button" aria-pressed={!mensual} onClick={() => setMensual(false)}>
            1 semana
          </button>
          <button type="button" aria-pressed={mensual} onClick={() => setMensual(true)}>
            4 semanas
          </button>
        </div>
        <div className="paquetes">
          {planes.map((pl) => {
            const pr = precio(pl.ids);
            return (
              <article key={pl.clave} className={`paquete${pl.destacado ? ' destacado' : ''}`}>
                <Foto img={FOTO[pl.clave]} sizes="(max-width: 900px) 100vw, 400px" className="paquete-foto" />
                <div className="paquete-cuerpo">
                  <span className="sobretitulo">
                    {pl.etiqueta}
                    {pl.destacado && <b className="recomendado">Recomendado</b>}
                  </span>
                  <h3>{pl.nombre}</h3>
                  <p>{pl.desc}</p>
                  <p className="paquete-precio">
                    <b>{pr ? dinero(pr.totalCentimos, pr.moneda) : '—'}</b> {mensual ? 'por 4 semanas' : 'por semana'}
                  </p>
                  <ul>
                    <li>{pr ? `${pr.emisiones} spots ${mensual ? 'en 4 semanas' : 'por semana'}` : 'Sin espacios en estas fechas'}</li>
                    {pl.puntos.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                    {pr && pr.descuentoBps > 0 && <li>Incluye {pr.descuentoBps / 100} % por volumen</li>}
                  </ul>
                  <button className={`btn ${pl.destacado ? 'primary' : 'contorno'}`} type="button" onClick={() => agregar(pl.ids)}>
                    Agregar a mi pauta <span className="arrow">→</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
