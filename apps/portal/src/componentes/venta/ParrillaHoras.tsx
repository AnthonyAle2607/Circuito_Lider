'use client';

import { useMemo, useRef, type MouseEvent } from 'react';
import type { Parrilla } from '@sp/schemas';
import { chispas } from '../animacion';
import { DIAS, type Alcance } from './datos';

interface Fila {
  programa: string;
  alcance: Alcance;
  inicio: string;
  fin: string;
  /** Día ISO → id de la franja de ese día. */
  dias: Map<number, string>;
}

/** Agrupa las franjas de la parrilla por programa y horario: una fila por bloque, una columna por día. */
function filasDe(p: Parrilla | undefined): Fila[] {
  if (!p) return [];
  const m = new Map<string, Fila>();
  for (const pr of p.programas) {
    for (const f of pr.franjas) {
      const k = `${f.inicio}|${f.fin}|${pr.nombre}`;
      if (!m.has(k)) m.set(k, { programa: pr.nombre, alcance: pr.alcance, inicio: f.inicio, fin: f.fin, dias: new Map() });
      m.get(k)!.dias.set(f.dia, f.id);
    }
  }
  return [...m.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** La parrilla semanal de una emisora; cada celda con programa se elige o se quita con un toque. */
export function ParrillaHoras({
  parrilla,
  nombre,
  elegidas,
  alternar,
}: {
  parrilla: Parrilla | undefined;
  nombre: string;
  elegidas: Set<string>;
  alternar: (id: string, agregar: boolean) => void;
}) {
  const filas = useMemo(() => filasDe(parrilla), [parrilla]);
  const caja = useRef<HTMLDivElement>(null);

  const tocar = (id: string, ev: MouseEvent<HTMLButtonElement>) => {
    const agregar = !elegidas.has(id);
    alternar(id, agregar);
    const box = caja.current;
    if (agregar && box) {
      const r = box.getBoundingClientRect();
      chispas(box, ev.clientX - r.left + box.scrollLeft, ev.clientY - r.top);
    }
  };

  return (
    <div className="grid-box" ref={caja}>
      <table className="grid real" aria-label={`Parrilla semanal de ${nombre}`}>
        <thead>
          <tr>
            <th>Programa</th>
            {DIAS.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.programa}-${f.inicio}`}>
              <td className="prog">
                <b>{f.programa}</b>
                {f.inicio}–{f.fin === '24:00' ? '00:00' : f.fin}
              </td>
              {DIAS.map((d, i) => {
                const id = f.dias.get(i + 1);
                if (!id) return <td key={d} className="vacia" />;
                const nat = f.alcance === 'nacional';
                return (
                  <td key={d}>
                    <button
                      type="button"
                      className={`cell${nat ? ' nat' : ''}`}
                      aria-pressed={elegidas.has(id)}
                      aria-label={`${DIAS[i]} ${f.inicio} ${f.programa}${nat ? ', en cadena nacional' : ''}`}
                      onClick={(ev) => tocar(id, ev)}
                    >
                      {nat ? 'Cadena' : 'Local'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
