'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { SinTarifa, cotizar } from '@sp/pricing';
import { crearCotizacion } from '@/app/acciones';
import { fechaCorta } from '@/lib/fechas';
import { usePauta } from '../Pauta';
import { emisionesDe, indexar, type DatosVenta } from './datos';

/**
 * Lo que comparten la tienda y el cotizador: la selección de «Tu pauta» convertida en fechas, su precio en vivo (el
 * mismo cálculo que la API, de @sp/pricing) y el envío que crea la cotización real.
 */
export function useCotizacion(datos: DatosVenta) {
  const router = useRouter();
  const p = usePauta();
  const franjas = useMemo(() => indexar(datos), [datos]);
  const t = datos.tarifario;
  const duracion = t && !t.duraciones.includes(p.duracion) ? t.duraciones[0]! : p.duracion;
  const emisiones = useMemo(() => emisionesDe(p.elegidas, franjas, p.lunes, p.semanas), [p.elegidas, franjas, p.lunes, p.semanas]);
  const precio = useMemo(() => {
    if (!t || emisiones.length === 0) return null;
    try {
      return cotizar(t, duracion, emisiones);
    } catch (e) {
      if (e instanceof SinTarifa) return null;
      throw e;
    }
  }, [t, duracion, emisiones]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  /** Crea la cotización y abre su página; si falla, deja el motivo (y qué horarios no tienen espacio). */
  const confirmar = (alFallar?: () => void) => {
    if (emisiones.length === 0) return;
    setError(null);
    iniciar(async () => {
      const r = await crearCotizacion({ duracionSegundos: duracion, emisiones: emisiones.map(({ franjaId, fecha }) => ({ franjaId, fecha })) });
      if (r.ok) {
        router.push(`/cotizacion/${r.id}`);
        return;
      }
      alFallar?.();
      if (r.faltantes?.length) {
        const nombres = r.faltantes.map((x) => `${franjas.get(x.franjaId)?.programa ?? 'Horario'} ${fechaCorta(x.fecha)}`);
        setError(`${r.mensaje} Sin espacio: ${nombres.slice(0, 6).join(', ')}${nombres.length > 6 ? '…' : ''}.`);
      } else setError(r.mensaje);
    });
  };

  return { p, t, franjas, duracion, emisiones, precio, error, setError, enviando, confirmar };
}
