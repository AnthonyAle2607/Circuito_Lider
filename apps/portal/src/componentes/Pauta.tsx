'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Filtros } from './venta/datos';

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

/**
 * Vive en el layout raíz: la cabecera («Mi pauta») y la portada comparten la selección. Los lunes posibles los
 * calcula el servidor y llegan como prop: así el servidor y el navegador no discrepan cerca de la medianoche.
 */
export function PautaProvider({ children, lunesOpciones }: { children: ReactNode; lunesOpciones: string[] }) {
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
