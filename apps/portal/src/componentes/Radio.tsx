'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/** Lo mínimo para sintonizar una emisora en vivo. */
export interface EmisoraVivo {
  slug: string;
  nombre: string;
  ciudad: string;
  frecuencia: string;
  streamUrl: string;
}

type Estado = 'parada' | 'conectando' | 'sonando' | 'error';

interface Radio {
  actual: EmisoraVivo | null;
  estado: Estado;
  /** Sintoniza la emisora; si ya suena, la pausa. */
  alternar: (e: EmisoraVivo) => void;
  parar: () => void;
  cerrar: () => void;
}

const Contexto = createContext<Radio | null>(null);

export function useRadio(): Radio {
  const r = useContext(Contexto);
  if (!r) throw new Error('useRadio necesita <RadioProvider>');
  return r;
}

/**
 * El reproductor del portal. Vive en el layout raíz, así que la emisora sigue sonando al cambiar de página. Un solo
 * <audio>: al pausar se suelta la señal (es en vivo; al volver se retoma el presente, no donde se dejó).
 */
export function RadioProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [actual, setActual] = useState<EmisoraVivo | null>(null);
  const [estado, setEstado] = useState<Estado>('parada');
  const [volumen, setVolumen] = useState(0.9);

  const soltar = () => {
    const a = audio.current;
    if (!a) return;
    a.pause();
    a.removeAttribute('src');
    a.load();
  };

  const sintonizar = useCallback((e: EmisoraVivo) => {
    const a = audio.current;
    if (!a) return;
    setActual(e);
    setEstado('conectando');
    a.src = e.streamUrl;
    a.play().catch(() => setEstado('error'));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: `${e.nombre} ${e.frecuencia}`, artist: 'En vivo', album: e.ciudad });
    }
  }, []);

  const parar = useCallback(() => {
    soltar();
    setEstado('parada');
  }, []);

  const alternar = useCallback(
    (e: EmisoraVivo) => {
      if (actual?.slug === e.slug && (estado === 'sonando' || estado === 'conectando')) parar();
      else sintonizar(e);
    },
    [actual, estado, parar, sintonizar],
  );

  const cerrar = useCallback(() => {
    soltar();
    setEstado('parada');
    setActual(null);
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volumen;
  }, [volumen]);

  // La barra ocupa el borde de abajo: Toño sube para no quedar tapado.
  useEffect(() => {
    document.body.classList.toggle('con-radio', actual !== null);
  }, [actual]);

  return (
    <Contexto.Provider value={{ actual, estado, alternar, parar, cerrar }}>
      {children}
      <audio
        ref={audio}
        preload="none"
        onPlaying={() => setEstado('sonando')}
        onWaiting={() => setEstado((s) => (s === 'parada' ? s : 'conectando'))}
        onError={() => setEstado((s) => (s === 'parada' ? s : 'error'))}
      />
      {actual && (
        <div className={`radio-barra ${estado}`} role="region" aria-label="Radio en vivo">
          <button
            type="button"
            className="radio-boton"
            onClick={() => alternar(actual)}
            aria-label={estado === 'sonando' || estado === 'conectando' ? `Pausar ${actual.nombre}` : `Escuchar ${actual.nombre}`}
          >
            {estado === 'sonando' || estado === 'conectando' ? '❚❚' : '▶'}
          </button>
          <div className="radio-info">
            <span className="radio-vivo" aria-live="polite">
              {estado === 'sonando' ? 'En vivo' : estado === 'conectando' ? 'Conectando…' : estado === 'error' ? 'Sin señal' : 'En pausa'}
            </span>
            <Link href={`/emisoras/${actual.slug}`}>
              <b>{actual.frecuencia.replace(' FM', '')}</b> {actual.ciudad}
            </Link>
            {estado === 'error' && <small>No pudimos conectar con la emisora. Prueba de nuevo en un momento.</small>}
          </div>
          <input
            className="radio-volumen"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumen}
            onChange={(ev) => setVolumen(Number(ev.target.value))}
            aria-label="Volumen"
          />
          <button type="button" className="radio-cerrar" onClick={cerrar} aria-label="Cerrar el reproductor">
            ×
          </button>
        </div>
      )}
    </Contexto.Provider>
  );
}

/** Botón «Escuchar en vivo» para cualquier emisora. Sin señal conocida, no se muestra. */
export function BotonVivo({ emisora, compacto = false }: { emisora: Omit<EmisoraVivo, 'streamUrl'> & { streamUrl: string | null }; compacto?: boolean }) {
  const { actual, estado, alternar } = useRadio();
  if (!emisora.streamUrl) return null;
  const esta = actual?.slug === emisora.slug;
  const activa = esta && (estado === 'sonando' || estado === 'conectando');
  const texto = !esta || estado === 'parada' || estado === 'error' ? 'Escuchar en vivo' : estado === 'conectando' ? 'Conectando…' : 'Pausar';
  return (
    <button
      type="button"
      className={`btn ${activa ? '' : 'primary'} vivo-btn${compacto ? ' compacto' : ''}`}
      aria-pressed={activa}
      onClick={() => alternar({ ...emisora, streamUrl: emisora.streamUrl! })}
    >
      <span className={`punto${activa ? ' on' : ''}`} aria-hidden="true" />
      {texto}
    </button>
  );
}
