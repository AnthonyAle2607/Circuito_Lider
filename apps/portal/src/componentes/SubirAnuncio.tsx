'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { subirAnuncio } from '@/app/acciones';

const MAX_BYTES = 60 * 1024 * 1024;

/** Lee la duración en el navegador para avisar antes de subir. La que vale es la que mide el servidor. */
function duracionLocal(f: File): Promise<number | null> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(f);
    const el = document.createElement(f.type.startsWith('video') ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      ok(Number.isFinite(el.duration) ? el.duration : null);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      ok(null);
    };
    el.src = url;
  });
}

export function SubirAnuncio({ maximoSegundos }: { maximoSegundos: number }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [duracion, setDuracion] = useState<number | null>(null);
  // Si el navegador ya sabe que el archivo no sirve, no se sube (el servidor lo rechazaría igual).
  const [bloqueado, setBloqueado] = useState(false);
  const [enviando, iniciar] = useTransition();

  const elegir = async (f: File | undefined) => {
    setAviso(null);
    setDuracion(null);
    setBloqueado(false);
    if (!f) return;
    if (!/\.(mp3|wav|mp4)$/i.test(f.name)) return (setBloqueado(true), setAviso({ tipo: 'error', texto: 'Ese formato no sirve: usa MP4, MP3 o WAV.' }));
    if (f.size > MAX_BYTES) return (setBloqueado(true), setAviso({ tipo: 'error', texto: 'El archivo pesa más de 60 MB.' }));
    const d = await duracionLocal(f);
    setDuracion(d);
    if (d && d > maximoSegundos + 0.25) {
      setBloqueado(true);
      setAviso({ tipo: 'error', texto: `Dura ${d.toFixed(1).replace('.', ',')} s y el máximo es ${maximoSegundos} s. Recórtalo antes de subirlo.` });
    }
  };

  const enviar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const datos = new FormData(ev.currentTarget);
    iniciar(async () => {
      const r = await subirAnuncio(datos);
      if (!r.ok) return setAviso({ tipo: 'error', texto: r.mensaje });
      form.current?.reset();
      setDuracion(null);
      setAviso({ tipo: 'ok', texto: 'Recibido. Lo estamos revisando: en unos segundos verás el resultado aquí abajo.' });
      router.refresh();
    });
  };

  return (
    <form ref={form} className="tarjeta formulario subir" onSubmit={enviar}>
      <div className="fila-campos">
        <div className="campo">
          <label htmlFor="archivo">Archivo</label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            required
            accept=".mp3,.wav,.mp4,audio/mpeg,audio/wav,video/mp4"
            onChange={(e) => elegir(e.target.files?.[0])}
          />
          <small>
            MP4, MP3 o WAV · hasta {maximoSegundos} s · hasta 60 MB{duracion ? ` · este dura ${duracion.toFixed(1).replace('.', ',')} s` : ''}
          </small>
        </div>
        <div className="campo">
          <label htmlFor="nombre">Nombre del anuncio</label>
          <input id="nombre" name="nombre" maxLength={120} placeholder="Ej.: Navidad 30 s" />
          <small>Opcional: si lo dejas vacío usamos el nombre del archivo.</small>
        </div>
      </div>
      {aviso && (
        <div className={`aviso ${aviso.tipo === 'ok' ? 'ok' : aviso.tipo === 'error' ? 'error' : ''}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>
          {aviso.texto}
        </div>
      )}
      <div className="acciones">
        <button className="btn primary" type="submit" disabled={enviando || bloqueado}>
          {enviando ? 'Subiendo…' : 'Subir anuncio'} <span className="arrow">→</span>
        </button>
      </div>
    </form>
  );
}

/** Mientras haya anuncios en proceso, la página se refresca sola cada 4 s para mostrar el resultado. */
export function RefrescoMientrasProcesa({ activo }: { activo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [activo, router]);
  return null;
}
