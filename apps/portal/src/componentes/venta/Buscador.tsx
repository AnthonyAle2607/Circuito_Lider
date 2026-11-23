'use client';

import type { FormEvent } from 'react';
import { usePauta } from '../Pauta';
import { irA, type DatosVenta } from './datos';

/** Buscador del héroe: dónde, cuándo y por cuánto tiempo. Filtra la tienda y baja hasta ella. */
export function Buscador({ datos }: { datos: DatosVenta }) {
  const { setFiltros, setSemanas, semanas } = usePauta();
  const enviar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setFiltros({ donde: String(f.get('donde')), cuando: String(f.get('cuando')) });
    setSemanas(Number(f.get('semanas')));
    irA('espacios');
  };
  return (
    <form className="buscador" onSubmit={enviar} aria-label="Buscar espacios">
      <label>
        <span>Dónde</span>
        <select name="donde" defaultValue="todo">
          <option value="todo">Todo el país</option>
          <option value="cadena">En cadena (10 emisoras)</option>
          {datos.emisoras.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.ciudad}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Cuándo</span>
        <select name="cuando" defaultValue="cualquiera">
          <option value="cualquiera">A cualquier hora</option>
          <option value="mananas">Mañanas</option>
          <option value="tardes">Tardes y noches</option>
          <option value="finde">Fin de semana</option>
        </select>
      </label>
      <label>
        <span>Por cuánto</span>
        <select name="semanas" defaultValue={semanas}>
          {[1, 2, 4, 8].map((s) => (
            <option key={s} value={s}>
              {s} {s === 1 ? 'semana' : 'semanas'}
            </option>
          ))}
        </select>
      </label>
      <button className="btn primary" type="submit">
        Ver espacios <span className="arrow">→</span>
      </button>
    </form>
  );
}
