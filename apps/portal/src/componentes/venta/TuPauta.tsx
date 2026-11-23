'use client';

import { dinero, fechaCorta } from '@/lib/fechas';
import type { Programa } from './datos';
import type { useCotizacion } from './useCotizacion';

type Cotizacion = ReturnType<typeof useCotizacion>;

/**
 * «Tu pauta»: lo elegido, agrupado por programa, con duración del spot, fecha de inicio, semanas, total y el botón
 * que crea la cotización. Vacía, explica qué hacer.
 */
export function TuPauta({ c, resumen }: { c: Cotizacion; resumen: Array<{ x: Programa; n: number; parcial: number }> }) {
  const { p, t } = c;
  const quitar = (x: Programa) =>
    p.setElegidas((s) => {
      const m = new Set(s);
      x.ids.forEach((id) => m.delete(id));
      return m;
    });

  return (
    <aside className="tu-pauta" aria-label="Tu pauta">
      <h3>Tu pauta</h3>
      {resumen.length === 0 ? (
        <p className="nota">Agrega programas y aquí verás cuántas veces suena tu anuncio y cuánto cuesta.</p>
      ) : (
        <ul>
          {resumen.map(({ x, n, parcial }) => (
            <li key={x.clave}>
              <span>
                <b>{x.nombre}</b>
                <small>
                  {x.alcance === 'nacional' ? 'En cadena' : x.ciudad} · {n} {n === 1 ? 'emisión' : 'emisiones'}
                  {parcial < x.ids.length ? ' · algunos días' : ''}
                </small>
              </span>
              <button type="button" className="quitar" aria-label={`Quitar ${x.nombre}`} onClick={() => quitar(x)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tu-pauta-opciones">
        <label>
          Spot
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
      </div>
      <div className="tu-pauta-total">
        <span>Total</span>
        <b>{dinero(c.precio?.totalCentimos ?? 0, t?.moneda)}</b>
      </div>
      <small className="nota">
        {c.emisiones.length} {c.emisiones.length === 1 ? 'emisión' : 'emisiones'}
        {c.precio && c.precio.descuentoBps > 0 ? ` · incluye ${c.precio.descuentoBps / 100} % por volumen` : ''}
        {t?.esEjemplo ? ' · tarifas de ejemplo' : ''}
      </small>
      <button className="btn primary" type="button" disabled={!t || c.emisiones.length === 0 || c.enviando} onClick={() => c.confirmar()}>
        {c.enviando ? 'Cotizando…' : 'Cotizar y reservar'} <span className="arrow">→</span>
      </button>
      <a className="ajustar" href="#cotizar">
        Ajustar hora por hora en la parrilla
      </a>
      {c.error && (
        <div className="aviso error" role="alert">
          {c.error}
        </div>
      )}
    </aside>
  );
}
