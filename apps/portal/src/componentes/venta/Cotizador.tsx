'use client';

import { useEffect, useRef, useState } from 'react';
import { dinero, fechaCorta } from '@/lib/fechas';
import { odometro } from '../animacion';
import { BotonVivo, useRadio } from '../Radio';
import type { DatosVenta } from './datos';
import { ParrillaHoras } from './ParrillaHoras';
import { useCotizacion } from './useCotizacion';
import { useMantener } from './useMantener';
import { useSintonizador } from './useSintonizador';

/**
 * El cotizador hora por hora: el dial sintoniza la emisora elegida (y la hace sonar en vivo), la parrilla deja
 * elegir cada horario y el total se actualiza con un odómetro. Edita la misma selección que la tienda.
 */
export function Cotizador({ datos }: { datos: DatosVenta }) {
  const c = useCotizacion(datos);
  const { p, t, franjas, emisiones, precio } = c;
  const radio = useRadio();
  const [emisora, setEmisora] = useState('caracas');
  const actual = datos.emisoras.find((e) => e.slug === emisora);
  const dial = useSintonizador(actual);
  const mantener = useMantener((reiniciar) => c.confirmar(reiniciar));

  // Si la radio está sonando, al cambiar de emisora en el dial cambia también la señal.
  useEffect(() => {
    if (!actual?.streamUrl || !radio.actual || radio.actual.slug === actual.slug) return;
    if (radio.estado === 'sonando' || radio.estado === 'conectando') radio.alternar({ ...actual, streamUrl: actual.streamUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

  // Total con odómetro: cada dígito rueda hasta su valor.
  const totalRef = useRef<HTMLDivElement>(null);
  const ponerTotal = useRef<((v: string) => void) | null>(null);
  useEffect(() => {
    if (totalRef.current && !ponerTotal.current) ponerTotal.current = odometro(totalRef.current);
    ponerTotal.current?.(dinero(precio?.totalCentimos ?? 0, t?.moneda));
  }, [precio, t]);

  const alternar = (id: string, agregar: boolean) => {
    c.setError(null);
    p.setElegidas((s) => {
      const n = new Set(s);
      if (agregar) n.add(id);
      else n.delete(id);
      return n;
    });
    if (agregar) dial.ensuciar();
  };

  const localesPor = (slug: string) => [...p.elegidas].filter((id) => franjas.get(id)?.emisora === slug).length;
  const nNac = emisiones.filter((e) => e.alcance === 'nacional').length;
  const ciudades = new Set([...p.elegidas].map((id) => franjas.get(id)?.emisora).filter(Boolean)).size;
  const resumen =
    emisiones.length === 0
      ? 'Elige al menos una hora en la parrilla'
      : `${nNac} en cadena nacional · ${emisiones.length - nNac} locales${ciudades ? ` en ${ciudades} ${ciudades === 1 ? 'emisora' : 'emisoras'}` : ''}${precio?.descuentoBps ? ` · incluye ${precio.descuentoBps / 100} % por volumen` : ''}`;

  return (
    <section id="cotizar" className="seccion oscura">
      <div className="wrap">
        <header className="encabezado">
          <span className="sobretitulo">Cotizador</span>
          <h2>
            La programación es tu <em>calendario</em>
          </h2>
          <p>Elige una emisora, escúchala en vivo y toca las horas en las que quieres sonar. Las celdas naranjas son programas en cadena: suenan en las diez emisoras a la vez.</p>
        </header>
        {!t && <div className="aviso error">Todavía no hay tarifario publicado. Vuelve pronto.</div>}
        <div className="tuner">
          <span className="band">FM</span>
          <b ref={dial.frecuencia}>88.0</b>
          <span className="tc" aria-live="polite">
            {dial.rotulo.t}
            <small>{dial.rotulo.s}</small>
          </span>
          <canvas ref={dial.canvas} aria-hidden="true" />
          {actual && <BotonVivo emisora={actual} compacto />}
        </div>
        <div className="stations" role="group" aria-label="Emisoras">
          {datos.emisoras.map((e) => {
            const n = localesPor(e.slug);
            return (
              <button key={e.slug} type="button" className="chipbtn" aria-pressed={e.slug === emisora} onClick={() => setEmisora(e.slug)}>
                {e.ciudad}
                <span>
                  {e.frecuencia.replace(' FM', '')}
                  {n > 0 ? ` · ${n}` : ''}
                </span>
              </button>
            );
          })}
        </div>
        <ParrillaHoras parrilla={datos.parrillas[emisora]} nombre={actual?.nombre ?? ''} elegidas={p.elegidas} alternar={alternar} />
        <p className="cot-nota">Horas de Venezuela (UTC−4). Las horas sin programa son música continua y se venderán más adelante.</p>
        <div className="quote">
          <div className="qopts">
            <label>
              Duración
              <select value={c.duracion} onChange={(e) => p.setDuracion(Number(e.target.value))}>
                {(t?.duraciones ?? [30]).map((d) => (
                  <option key={d} value={d}>
                    {d} s
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <select value={p.lunes} onChange={(e) => p.setLunes(e.target.value)}>
                {p.lunesOpciones.map((l) => (
                  <option key={l} value={l}>
                    {fechaCorta(l)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Semanas
              <select value={p.semanas} onChange={(e) => p.setSemanas(Number(e.target.value))}>
                {[1, 2, 4, 8].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <span className="qsum" aria-live="polite">
              {resumen}
            </span>
          </div>
          <div className="quote-total">
            <div>
              <div className="big" ref={totalRef}>
                $0
              </div>
              {t?.esEjemplo && <span className="ex">tarifas de ejemplo</span>}
            </div>
            <button
              className="hold"
              ref={mantener.boton}
              type="button"
              disabled={!t || emisiones.length === 0 || c.enviando}
              aria-label="Mantén presionado para cotizar tu pauta"
            >
              <span className="fill" aria-hidden="true" />
              <span className="lbl">{c.enviando || mantener.disparado ? 'Cotizando…' : 'Mantén para cotizar'}</span>
            </button>
          </div>
        </div>
        {c.error && (
          <div className="aviso error cot-error" role="alert">
            {c.error}
          </div>
        )}
      </div>
    </section>
  );
}
