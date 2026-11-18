'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Emisora, Parrilla } from '@sp/schemas';
import { SinTarifa, cotizar, type Tarifario } from '@sp/pricing';
import { crearCotizacion } from '@/app/acciones';
import { chispas, odometro } from './efectos-diseno';
import { diaIso, dinero, fechaCorta, hoyEnCaracas, proximosLunes, sumarDias } from '@/lib/fechas';

export interface DatosVenta {
  emisoras: Emisora[];
  parrillas: Record<string, Parrilla>;
  tarifario: (Tarifario & { duraciones: number[] }) | null;
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
type Franja = Parrilla['programas'][number]['franjas'][number] & { programa: string; alcance: 'nacional' | 'local'; emisora: string | null };

/** Todas las franjas del circuito, una vez: las nacionales sin emisora, las locales con la suya. */
function indexar(d: DatosVenta): Map<string, Franja> {
  const m = new Map<string, Franja>();
  for (const [slug, p] of Object.entries(d.parrillas)) {
    for (const pr of p.programas) {
      for (const f of pr.franjas) {
        if (!m.has(f.id)) m.set(f.id, { ...f, programa: pr.nombre, alcance: pr.alcance, emisora: pr.alcance === 'local' ? slug : null });
      }
    }
  }
  return m;
}

/** Fechas concretas de las franjas elegidas: semana a semana desde el lunes elegido, solo desde mañana. */
function emisionesDe(elegidas: Set<string>, franjas: Map<string, Franja>, lunes: string, semanas: number) {
  const manana = sumarDias(hoyEnCaracas(), 1);
  const out: Array<{ franjaId: string; fecha: string; alcance: 'nacional' | 'local' }> = [];
  for (const id of elegidas) {
    const f = franjas.get(id);
    if (!f) continue;
    for (let w = 0; w < semanas; w++) {
      const fecha = sumarDias(lunes, f.dia - 1 + w * 7);
      if (fecha >= manana) out.push({ franjaId: id, fecha, alcance: f.alcance });
    }
  }
  return out;
}

/** Paquetes armados sobre la parrilla real. */
function paquetes(franjas: Map<string, Franja>) {
  const todas = [...franjas.values()];
  const locales = (slugs: string[]) => todas.filter((f) => f.alcance === 'local' && slugs.includes(f.emisora!)).map((f) => f.id);
  return [
    {
      clave: 'ciudad',
      etiqueta: 'Local',
      nombre: 'Ciudad',
      desc: 'Los programas locales de Caracas.',
      ids: locales(['caracas']),
      puntos: ['Líder 94.9 Caracas', 'Máximo Volumen, Batita en Líder, El 3 Pack y más', 'Comercial de 30 s', 'Certificado de transmisión'],
    },
    {
      clave: 'region',
      etiqueta: 'Regional',
      nombre: 'Región',
      desc: 'Las ciudades con programación local propia.',
      ids: locales(['caracas', 'merida', 'maracaibo']),
      puntos: ['Caracas, Mérida y Maracaibo', 'Todos sus programas locales', 'Comercial de 30 s', 'Certificado de transmisión'],
      destacado: true,
    },
    {
      clave: 'nacional',
      etiqueta: 'Nacional',
      nombre: 'Red completa',
      desc: 'Programas en cadena, en las 10 ciudades a la vez.',
      ids: todas.filter((f) => f.alcance === 'nacional').map((f) => f.id),
      puntos: ['10 emisoras con un solo spot', 'ENCENDIDOS, CONVOCADOS y AL AIRE', 'De lunes a viernes', 'Certificado de transmisión'],
    },
  ];
}

export function Venta({ datos }: { datos: DatosVenta }) {
  const router = useRouter();
  const franjas = useMemo(() => indexar(datos), [datos]);
  const lunesOpciones = useMemo(() => proximosLunes(6), []);
  const t = datos.tarifario;
  const [emisora, setEmisora] = useState('caracas');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [duracion, setDuracion] = useState(t?.duraciones[0] ?? 30);
  const [semanas, setSemanas] = useState(2);
  const [lunes, setLunes] = useState(lunesOpciones[0]!);
  const [mensual, setMensual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const emisiones = useMemo(() => emisionesDe(elegidas, franjas, lunes, semanas), [elegidas, franjas, lunes, semanas]);
  const precio = useMemo(() => {
    if (!t || emisiones.length === 0) return null;
    try {
      return cotizar(t, duracion, emisiones);
    } catch (e) {
      if (e instanceof SinTarifa) return null;
      throw e;
    }
  }, [t, duracion, emisiones]);

  // ── total con odómetro ────────────────────────────────────────────────────
  const totalRef = useRef<HTMLDivElement>(null);
  const setTotal = useRef<((v: string) => void) | null>(null);
  useEffect(() => {
    if (totalRef.current && !setTotal.current) setTotal.current = odometro(totalRef.current);
    setTotal.current?.(dinero(precio?.totalCentimos ?? 0, t?.moneda));
  }, [precio, t]);

  // ── sintonizador: la frecuencia rueda hasta la emisora y la onda se ensucia mientras tanto ──
  const tf = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tono = useRef({ f: 88, ruido: 1, token: 0 });
  const [rotulo, setRotulo] = useState<{ t: string; s: string }>({ t: 'Buscando señal', s: ' ' });
  const actual = datos.emisoras.find((e) => e.slug === emisora);
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    let vivo = true;
    const medir = () => {
      const r = c.getBoundingClientRect();
      c.width = r.width * devicePixelRatio;
      c.height = r.height * devicePixelRatio;
    };
    medir();
    addEventListener('resize', medir);
    const onda = (tm: number) => {
      if (!vivo) return;
      const w = c.width,
        h = c.height,
        n = tono.current.ruido;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#FE6B00';
      ctx.lineWidth = 2.2 * devicePixelRatio;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const u = x / w;
        const y = h / 2 + (1 - n * 0.85) * h * 0.32 * Math.sin(u * Math.PI) * (Math.sin(u * 26 + tm / 300) * 0.6 + Math.sin(u * 61 - tm / 170) * 0.4) + (Math.random() - 0.5) * n * h * 0.8;
        if (x) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      if (!reduce) requestAnimationFrame(onda);
    };
    requestAnimationFrame(onda);
    return () => {
      vivo = false;
      removeEventListener('resize', medir);
    };
  }, []);
  useEffect(() => {
    if (!actual) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const T = tono.current;
    const mio = ++T.token;
    const desde = T.f;
    const hasta = parseFloat(actual.frecuencia);
    const dur = reduce ? 0 : Math.min(1400, 450 + Math.abs(hasta - desde) * 80);
    const t0 = performance.now();
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    setRotulo({ t: 'Sintonizando…', s: ' ' });
    const paso = (now: number) => {
      if (mio !== T.token) return;
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      T.f = desde + (hasta - desde) * ease(p);
      T.ruido = reduce ? 0 : p < 1 ? Math.min(1, 0.4 + Math.abs(hasta - T.f) / 2.5) : Math.max(0, T.ruido - 0.05);
      if (tf.current) tf.current.textContent = T.f.toFixed(1);
      if (p < 1 || T.ruido > 0) requestAnimationFrame(paso);
      else setRotulo({ t: actual.ciudad, s: `${actual.nombre} · ${actual.frecuencia}` });
    };
    requestAnimationFrame(paso);
  }, [actual]);

  // ── parrilla de la emisora: filas por programa y horario, columnas por día ──
  const filas = useMemo(() => {
    const p = datos.parrillas[emisora];
    if (!p) return [];
    const m = new Map<string, { programa: string; alcance: 'nacional' | 'local'; inicio: string; fin: string; dias: Map<number, string> }>();
    for (const pr of p.programas) {
      for (const f of pr.franjas) {
        const k = `${f.inicio}|${f.fin}|${pr.nombre}`;
        if (!m.has(k)) m.set(k, { programa: pr.nombre, alcance: pr.alcance, inicio: f.inicio, fin: f.fin, dias: new Map() });
        m.get(k)!.dias.set(f.dia, f.id);
      }
    }
    return [...m.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [datos, emisora]);

  const caja = useRef<HTMLDivElement>(null);
  const alternar = (id: string, ev: React.MouseEvent<HTMLButtonElement>) => {
    setError(null);
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else {
        n.add(id);
        const box = caja.current;
        if (box) {
          const r = box.getBoundingClientRect();
          chispas(box, ev.clientX - r.left + box.scrollLeft, ev.clientY - r.top);
        }
        tono.current.ruido = Math.max(tono.current.ruido, 0.7);
      }
      return n;
    });
  };

  const localesPor = (slug: string) => [...elegidas].filter((id) => franjas.get(id)?.emisora === slug).length;
  const nNac = emisiones.filter((e) => e.alcance === 'nacional').length;
  const nLoc = emisiones.length - nNac;
  const ciudades = new Set([...elegidas].map((id) => franjas.get(id)?.emisora).filter(Boolean));

  // ── paquetes ────────────────────────────────────────────────────────────────
  const planes = useMemo(() => paquetes(franjas), [franjas]);
  const precioPlan = (ids: string[], sem: number) => {
    if (!t) return null;
    const em = emisionesDe(new Set(ids), franjas, lunesOpciones[0]!, sem);
    if (em.length === 0) return null;
    try {
      return cotizar(t, t.duraciones.includes(30) ? 30 : t.duraciones[0]!, em);
    } catch {
      return null;
    }
  };
  const aplicar = (ids: string[], primeraLocal?: string) => {
    setElegidas(new Set(ids));
    setSemanas(mensual ? 4 : 1);
    setDuracion(t?.duraciones.includes(30) ? 30 : (t?.duraciones[0] ?? 30));
    if (primeraLocal) setEmisora(primeraLocal);
    setError(null);
    document.getElementById('cotizar')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  // ── mantener para confirmar → crea la cotización real ──────────────────────
  const hold = useRef<HTMLButtonElement>(null);
  const [lista, setLista] = useState(false);
  const confirmar = () => {
    if (emisiones.length === 0) return;
    iniciar(async () => {
      const r = await crearCotizacion({ duracionSegundos: duracion, emisiones: emisiones.map(({ franjaId, fecha }) => ({ franjaId, fecha })) });
      if (r.ok) {
        router.push(`/cotizacion/${r.id}`);
        return;
      }
      setLista(false);
      if (r.faltantes?.length) {
        const nombres = r.faltantes.map((x) => `${franjas.get(x.franjaId)?.programa ?? 'Franja'} ${fechaCorta(x.fecha)}`);
        setError(`${r.mensaje} Sin espacio: ${nombres.slice(0, 6).join(', ')}${nombres.length > 6 ? '…' : ''}.`);
      } else setError(r.mensaje);
    });
  };
  useEffect(() => {
    const b = hold.current!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let p = 0,
      sosteniendo = false,
      ultimo = 0,
      hecho = false;
    const bucle = (now: number) => {
      const dt = (now - ultimo) / 1000;
      ultimo = now;
      if (hecho) return;
      p = sosteniendo ? Math.min(1, p + dt / (reduce ? 0.2 : 1.1)) : Math.max(0, p - dt * 2.5);
      b.style.setProperty('--p', String(p));
      if (p >= 1) {
        hecho = true;
        b.classList.add('done');
        const r = b.getBoundingClientRect();
        chispas(b, r.width / 2, r.height / 2);
        setLista(true);
        b.dispatchEvent(new CustomEvent('confirmado'));
        setTimeout(() => {
          hecho = false;
          p = 0;
          b.classList.remove('done');
          b.style.setProperty('--p', '0');
        }, 2500);
        return;
      }
      if (sosteniendo || p > 0) requestAnimationFrame(bucle);
    };
    const empezar = () => {
      if (hecho || b.disabled) return;
      sosteniendo = true;
      ultimo = performance.now();
      requestAnimationFrame(bucle);
    };
    const parar = () => (sosteniendo = false);
    const abajo = (e: PointerEvent) => {
      try {
        b.setPointerCapture(e.pointerId);
      } catch {}
      empezar();
    };
    const tecla = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        empezar();
      }
    };
    const soltar = (e: KeyboardEvent) => (e.key === ' ' || e.key === 'Enter') && parar();
    b.addEventListener('pointerdown', abajo);
    b.addEventListener('pointerup', parar);
    b.addEventListener('pointercancel', parar);
    b.addEventListener('pointerleave', parar);
    b.addEventListener('keydown', tecla);
    b.addEventListener('keyup', soltar);
    return () => {
      b.removeEventListener('pointerdown', abajo);
      b.removeEventListener('pointerup', parar);
      b.removeEventListener('pointercancel', parar);
      b.removeEventListener('pointerleave', parar);
      b.removeEventListener('keydown', tecla);
      b.removeEventListener('keyup', soltar);
    };
  }, []);
  // El evento lo dispara el bucle de arriba; aquí se lee el estado vigente (emisiones, duración) para enviar.
  const confirmarRef = useRef(confirmar);
  confirmarRef.current = confirmar;
  useEffect(() => {
    const b = hold.current!;
    const f = () => confirmarRef.current();
    b.addEventListener('confirmado', f);
    return () => b.removeEventListener('confirmado', f);
  }, []);

  const ejemplo = t?.esEjemplo ?? true;

  return (
    <>
      {/* PAQUETES */}
      <section id="paquetes">
        <div className="wrap">
          <div className="sec-head c rv">
            <span className="label">Paquetes</span>
            <h2>
              Empieza con un <span className="tape">paquete</span>, ajústalo a tu medida
            </h2>
            <p>Armados sobre la programación real del circuito. Incluyen revisión humana del spot, seguimiento y certificado.{ejemplo && ' Precios de ejemplo.'}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="toggle" role="group" aria-label="Duración de la campaña">
              <button type="button" aria-pressed={!mensual} onClick={() => setMensual(false)}>
                1 semana
              </button>
              <button type="button" aria-pressed={mensual} onClick={() => setMensual(true)}>
                4 semanas
              </button>
            </div>
          </div>
          <div className="plans">
            {planes.map((pl) => {
              const pr = precioPlan(pl.ids, mensual ? 4 : 1);
              return (
                <article key={pl.clave} className={`plan${pl.destacado ? ' feat' : ''}`}>
                  {pl.destacado && <span className="badge">Recomendado para empezar</span>}
                  <span className="label">{pl.etiqueta}</span>
                  <h3>{pl.nombre}</h3>
                  <p className="desc">{pl.desc}</p>
                  <div>
                    <span className="price">{pr ? dinero(pr.totalCentimos, pr.moneda) : '—'}</span>{' '}
                    <span className="per">{mensual ? 'por 4 semanas' : 'por semana'}</span>
                  </div>
                  <ul>
                    <li>{pr ? `${pr.emisiones} spots ${mensual ? 'en 4 semanas' : 'por semana'}` : 'Sin espacios en estas fechas'}</li>
                    {pl.puntos.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                    {pr && pr.descuentoBps > 0 && <li>Incluye {pr.descuentoBps / 100} % por volumen</li>}
                  </ul>
                  <button className="btn" type="button" onClick={() => aplicar(pl.ids, pl.clave === 'nacional' ? undefined : 'caracas')}>
                    Elegir y ajustar <span className="arrow">→</span>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* COTIZADOR */}
      <section id="cotizar" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="sec-head rv">
            <span className="label">Cotizador</span>
            <h2>
              La programación es tu <span className="tape r">calendario</span>
            </h2>
            <p>Toca una emisora y luego las horas en las que quieres sonar. Las celdas rojas son programas en cadena nacional: suenan en las diez emisoras a la vez.</p>
          </div>
          {!t && <div className="aviso error">Todavía no hay tarifario publicado. Vuelve pronto.</div>}
          <div className="tuner">
            <span className="band">FM</span>
            <b ref={tf}>88.0</b>
            <span className="tc" aria-live="polite">
              {rotulo.t}
              <small>{rotulo.s}</small>
            </span>
            <canvas ref={canvas} aria-hidden="true" />
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
          <div className="grid-box" ref={caja}>
            <table className="grid real" aria-label={`Parrilla semanal de ${actual?.nombre ?? ''}`}>
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
                            onClick={(ev) => alternar(id, ev)}
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
          <p className="cot-nota">Horas de Venezuela (UTC−4). Las horas sin programa son música continua y se venderán más adelante.</p>
          <div className="quote">
            <div className="qopts">
              <label>
                Duración
                <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
                  {(t?.duraciones ?? [30]).map((d) => (
                    <option key={d} value={d}>
                      {d} s
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Desde
                <select value={lunes} onChange={(e) => setLunes(e.target.value)}>
                  {lunesOpciones.map((l) => (
                    <option key={l} value={l}>
                      {fechaCorta(l)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Semanas
                <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
                  {[1, 2, 4, 8].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <span className="qsum" aria-live="polite">
                {emisiones.length === 0
                  ? 'Elige al menos una hora en la parrilla'
                  : `${nNac} en cadena nacional · ${nLoc} locales${ciudades.size ? ` en ${ciudades.size} ${ciudades.size === 1 ? 'emisora' : 'emisoras'}` : ''}${precio && precio.descuentoBps ? ` · incluye ${precio.descuentoBps / 100} % por volumen` : ''}`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div className="big" ref={totalRef}>
                  $0
                </div>
                {ejemplo && <span className="ex">tarifas de ejemplo</span>}
              </div>
              <button className="hold" ref={hold} type="button" disabled={!t || emisiones.length === 0 || enviando} aria-label="Mantén presionado para cotizar tu pauta">
                <span className="fill" aria-hidden="true" />
                <span className="lbl">{enviando || lista ? 'Cotizando…' : 'Mantén para cotizar'}</span>
              </button>
            </div>
          </div>
          {error && (
            <div className="aviso error cot-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
