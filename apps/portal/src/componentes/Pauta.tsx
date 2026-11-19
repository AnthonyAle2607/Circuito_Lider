'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { proximosLunes } from '@/lib/fechas';

/** Filtros de la tienda: los fija el buscador del héroe o los botones de la propia tienda. */
export interface Filtros {
  /** 'todo' = todo; 'cadena' = solo en cadena; un slug = esa ciudad (sus locales y la cadena). */
  donde: string;
  /** 'cualquiera' | 'mananas' | 'tardes' | 'finde' */
  cuando: string;
}

interface Pauta {
  /** Franjas elegidas (ids). La tienda, los paquetes y la parrilla del cotizador editan la misma selección. */
  elegidas: Set<string>;
  setElegidas: (f: (s: Set<string>) => Set<string>) => void;
  duracion: number;
  setDuracion: (n: number) => void;
  semanas: number;
  setSemanas: (n: number) => void;
  lunes: string;
  setLunes: (l: string) => void;
  lunesOpciones: string[];
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
  /** Cuántos programas hay en la pauta (lo calcula la portada, que conoce la parrilla; lo muestra la cabecera). */
  programas: number;
  setProgramas: (n: number) => void;
}

const Contexto = createContext<Pauta | null>(null);

export function usePauta(): Pauta {
  const p = useContext(Contexto);
  if (!p) throw new Error('usePauta necesita <PautaProvider>');
  return p;
}

/** Vive en el layout raíz: la cabecera («Mi pauta») y la portada comparten la selección. */
export function PautaProvider({ children }: { children: ReactNode }) {
  const lunesOpciones = useMemo(() => proximosLunes(6), []);
  const [elegidas, setElegidasRaw] = useState<Set<string>>(new Set());
  const [duracion, setDuracion] = useState(30);
  const [semanas, setSemanas] = useState(2);
  const [lunes, setLunes] = useState(lunesOpciones[0]!);
  const [filtros, setFiltros] = useState<Filtros>({ donde: 'todo', cuando: 'cualquiera' });
  const [programas, setProgramas] = useState(0);
  const setElegidas = (f: (s: Set<string>) => Set<string>) => setElegidasRaw((s) => f(s));
  return (
    <Contexto.Provider
      value={{ elegidas, setElegidas, duracion, setDuracion, semanas, setSemanas, lunes, setLunes, lunesOpciones, filtros, setFiltros, programas, setProgramas }}
    >
      {children}
    </Contexto.Provider>
  );
}

/** Botón «Mi pauta» de la cabecera: lleva a la tienda y muestra cuántos programas llevas. */
export function BotonMiPauta() {
  const { programas } = usePauta();
  return (
    <a className="btn primary mi-pauta" href="/#espacios">
      Mi pauta {programas > 0 && <span className="cuenta">{programas}</span>}
    </a>
  );
}
