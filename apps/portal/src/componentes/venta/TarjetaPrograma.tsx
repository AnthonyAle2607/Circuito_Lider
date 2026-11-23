'use client';

import type { MouseEvent } from 'react';
import { horario } from '@/lib/vivo';
import type { Programa } from './datos';

/**
 * Un programa en la tienda: alcance, nombre, horarios, descripción, precio «desde» y el botón para sumarlo a la pauta.
 * `enPauta` = cuántas de sus franjas ya están elegidas (puede ser parcial si se ajustó en la parrilla).
 */
export function TarjetaPrograma({
  programa: x,
  desde,
  enPauta,
  alternar,
}: {
  programa: Programa;
  desde: string | null;
  enPauta: number;
  alternar: (ev: MouseEvent<HTMLButtonElement>) => void;
}) {
  const todo = enPauta === x.ids.length;
  const cadena = x.alcance === 'nacional';
  return (
    <article className={`producto${enPauta ? ' en-pauta' : ''}${cadena ? ' cadena' : ''}`}>
      <header className="producto-cabeza">
        <span className={`chip ${cadena ? 'chip-cadena' : 'chip-local'}`}>{cadena ? 'En cadena · 10 emisoras' : `Solo ${x.ciudad}`}</span>
        {enPauta > 0 && <span className="producto-marca">✓ En tu pauta</span>}
      </header>
      <h3>{x.nombre}</h3>
      <ul className="producto-horarios">
        {horario(x.franjas).map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      {x.descripcion && <p className="producto-desc">{x.descripcion}</p>}
      <footer className="producto-pie">
        <span>
          desde <b>{desde ?? '—'}</b> <small>por spot</small>
        </span>
        <button type="button" className={`btn ${todo ? 'quieto' : 'primary'}`} aria-pressed={todo} onClick={alternar}>
          {todo ? 'Quitar' : enPauta ? 'Agregar todo' : 'Agregar'}
        </button>
      </footer>
    </article>
  );
}
