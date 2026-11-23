'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import type { Emisora, Parrilla } from '@sp/schemas';
import { SinTarifa, cotizar, type Tarifario } from '@sp/pricing';
import { crearCotizacion } from '@/app/acciones';
import { chispas, odometro } from './efectos-diseno';
import { usePauta } from './Pauta';
import { BotonVivo, useRadio } from './Radio';
import { dinero, fechaCorta, hoyEnCaracas, sumarDias } from '@/lib/fechas';
import { horario } from '@/lib/vivo';
import { CARACAS_AEREA, CIUDADES, IMAGENES, fondoDePrograma, type Imagen } from '@/lib/imagenes';
import { Foto } from './Foto';

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

/** Un programa como «producto» de la tienda: el de cadena una vez, cada local con su emisora. */
interface Programa {
  clave: string;
  nombre: string;
  alcance: 'nacional' | 'local';
  emisora: string | null;
  ciudad: string | null;
  descripcion: string | null;
  ids: string[];
  franjas: Array<{ dia: number; inicio: string; fin: string }>;
  variante: string;
}

const VARIANTES = ['v1', 'v2', 'v3', 'v5'];

function programasDe(d: DatosVenta): Programa[] {
  const m = new Map<string, Programa>();
  for (const [slug, p] of Object.entries(d.parrillas)) {
    for (const pr of p.programas) {
      const nac = pr.alcance === 'nacional';
      const clave = nac ? `cadena:${pr.nombre}` : `${slug}:${pr.nombre}`;
      if (m.has(clave)) continue;
      m.set(clave, {
        clave,
        nombre: pr.nombre,
        alcance: pr.alcance,
        emisora: nac ? null : slug,
        ciudad: nac ? null : p.emisora.ciudad,
        descripcion: pr.descripcion,
        ids: pr.franjas.map((f) => f.id),
        franjas: pr.franjas,
        variante: '',
      });
    }
  }
  const primera = (x: Programa) => [...x.franjas].sort((a, b) => a.inicio.localeCompare(b.inicio))[0]?.inicio ?? '';
  return [...m.values()]
    .sort((a, b) => (a.alcance !== b.alcance ? (a.alcance === 'nacional' ? -1 : 1) : (a.ciudad ?? '').localeCompare(b.ciudad ?? '') || primera(a).localeCompare(primera(b))))
    .map((x, i) => ({ ...x, variante: VARIANTES[i % VARIANTES.length]! }));
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

/** Lo que comparten la tienda y el cotizador: la selección hecha fechas, su precio y el envío. */
function useCotizacion(datos: DatosVenta) {
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

const irA = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

// ── buscador del héroe ───────────────────────────────────────────────────────
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
        Dónde
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
        Cuándo
        <select name="cuando" defaultValue="cualquiera">
          <option value="cualquiera">A cualquier hora</option>
          <option value="mananas">Mañanas</option>
          <option value="tardes">Tardes y noches</option>
          <option value="finde">Fin de semana</option>
        </select>
      </label>
      <label>
        Por cuánto
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

// ── tienda: los programas como productos y «Tu pauta» al lado ────────────────
export function Tienda({ datos }: { datos: DatosVenta }) {
  const c = useCotizacion(datos);
  const { p, t } = c;
  const programas = useMemo(() => programasDe(datos), [datos]);
  const ciudadesConLocales = useMemo(
    () => datos.emisoras.filter((e) => programas.some((x) => x.emisora === e.slug)),
    [datos.emisoras, programas],
  );

  const visibles = programas.filter((x) => {
    const { donde, cuando } = p.filtros;
    if (donde === 'cadena' && x.alcance !== 'nacional') return false;
    if (donde !== 'todo' && donde !== 'cadena' && x.alcance === 'local' && x.emisora !== donde) return false;
    // La madrugada (00:00–05:00) cuenta como noche: es la cola de los programas nocturnos.
    if (cuando === 'mananas' && !x.franjas.some((f) => f.inicio >= '05:00' && f.inicio < '12:00')) return false;
    if (cuando === 'tardes' && !x.franjas.some((f) => f.inicio >= '12:00' || f.inicio < '05:00')) return false;
    if (cuando === 'finde' && !x.franjas.some((f) => f.dia >= 6)) return false;
    return true;
  });

  const enPauta = (x: Programa) => x.ids.filter((id) => p.elegidas.has(id)).length;
  const alternar = (x: Programa, ev: React.MouseEvent<HTMLButtonElement>) => {
    c.setError(null);
    const todas = enPauta(x) === x.ids.length;
    p.setElegidas((s) => {
      const n = new Set(s);
      for (const id of x.ids) (todas ? n.delete(id) : n.add(id));
      return n;
    });
    if (!todas) {
      const b = ev.currentTarget;
      const r = b.getBoundingClientRect();
      chispas(b, r.width / 2, r.height / 2);
    }
  };

  // Resumen de la pauta por programa, con sus emisiones en las fechas elegidas.
  const resumen = programas
    .map((x) => ({ x, n: c.emisiones.filter((e) => x.ids.includes(e.franjaId)).length, parcial: enPauta(x) }))
    .filter((r) => r.parcial > 0);
  const { setProgramas } = p;
  useEffect(() => setProgramas(resumen.length), [resumen.length, setProgramas]);

  const desde = (alcance: 'nacional' | 'local') => {
    if (!t) return null;
    const ts = t.tarifas.filter((x) => x.alcance === alcance).sort((a, b) => a.precioCentimos - b.precioCentimos);
    return ts[0] ? dinero(ts[0].precioCentimos, t.moneda) : null;
  };
  const chip = (activo: boolean, texto: string, accion: () => void) => (
    <button key={texto} type="button" className="chipbtn" aria-pressed={activo} onClick={accion}>
      {texto}
    </button>
  );
  const f = p.filtros;

  return (
    <section id="espacios" className="tienda">
      <div className="wrap">
        <div className="sec-head rv">
          <span className="label">Dónde suena tu anuncio</span>
          <h2>
            Dentro de los programas que <span className="tape">ya escuchan</span>
          </h2>
          <p>Agrega los programas que quieras a tu pauta y mira el precio al instante. Tu spot sale en la tanda comercial de la programación real.</p>
        </div>
        <div className="tienda-filtros" role="group" aria-label="Filtrar programas">
          {chip(f.donde === 'todo', 'Todos', () => p.setFiltros({ ...f, donde: 'todo' }))}
          {chip(f.donde === 'cadena', 'En cadena', () => p.setFiltros({ ...f, donde: 'cadena' }))}
          {ciudadesConLocales.map((e) => chip(f.donde === e.slug, e.ciudad, () => p.setFiltros({ ...f, donde: e.slug })))}
          <span className="sep" aria-hidden="true" />
          {chip(f.cuando === 'mananas', 'Mañanas', () => p.setFiltros({ ...f, cuando: f.cuando === 'mananas' ? 'cualquiera' : 'mananas' }))}
          {chip(f.cuando === 'tardes', 'Tardes y noches', () => p.setFiltros({ ...f, cuando: f.cuando === 'tardes' ? 'cualquiera' : 'tardes' }))}
          {chip(f.cuando === 'finde', 'Fin de semana', () => p.setFiltros({ ...f, cuando: f.cuando === 'finde' ? 'cualquiera' : 'finde' }))}
        </div>

        <div className="tienda-rejilla">
          <div className="productos">
            {visibles.length === 0 && <p className="nota">No hay programas con esos filtros. Prueba con «Todos».</p>}
            {visibles.map((x) => {
              const n = enPauta(x);
              const todo = n === x.ids.length;
              return (
                <article key={x.clave} className={`producto${n ? ' en-pauta' : ''}`}>
                  <div className={`pc ${x.variante} con-foto`}>
                    <Foto img={fondoDePrograma(x.clave)} sizes="(max-width: 760px) 100vw, 320px" className="pc-foto" />
                    <span className="velo" aria-hidden="true" />
                    <div className="tag">
                      <span>{x.alcance === 'nacional' ? 'En cadena · 10 emisoras' : `Solo ${x.ciudad}`}</span>
                      <span className="eq" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                    <h3>{x.nombre}</h3>
                  </div>
                  <div className="producto-info">
                    {horario(x.franjas).map((h) => (
                      <span key={h} className="when">
                        {h}
                      </span>
                    ))}
                    {x.descripcion && <p>{x.descripcion}</p>}
                    <div className="producto-pie">
                      <span>
                        desde <b>{desde(x.alcance) ?? '—'}</b>
                        <small> por spot</small>
                      </span>
                      <button type="button" className={`btn${todo ? '' : ' primary'}`} aria-pressed={todo} onClick={(ev) => alternar(x, ev)}>
                        {todo ? '✓ En tu pauta' : n ? 'Agregar todo' : 'Agregar'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="tu-pauta" aria-label="Tu pauta">
            <span className="label">Tu pauta</span>
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
                    <button
                      type="button"
                      className="quitar"
                      aria-label={`Quitar ${x.nombre}`}
                      onClick={() =>
                        p.setElegidas((s) => {
                          const m = new Set(s);
                          x.ids.forEach((id) => m.delete(id));
                          return m;
                        })
                      }
                    >
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
        </div>
      </div>
    </section>
  );
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

/** Una foto por paquete: la ciudad, la región andina y el público de todo el país. */
const FOTO_PAQUETE: Record<string, Imagen> = { ciudad: CARACAS_AEREA, region: CIUDADES.merida ?? IMAGENES.microfonoEstudio, nacional: IMAGENES.publicoLuces };

// ── paquetes: se suman a la pauta ────────────────────────────────────────────
export function Paquetes({ datos }: { datos: DatosVenta }) {
  const p = usePauta();
  const franjas = useMemo(() => indexar(datos), [datos]);
  const t = datos.tarifario;
  const [mensual, setMensual] = useState(false);
  const planes = useMemo(() => paquetes(franjas), [franjas]);
  const precioPlan = (ids: string[], sem: number) => {
    if (!t) return null;
    const em = emisionesDe(new Set(ids), franjas, p.lunesOpciones[0]!, sem);
    if (em.length === 0) return null;
    try {
      return cotizar(t, t.duraciones.includes(30) ? 30 : t.duraciones[0]!, em);
    } catch {
      return null;
    }
  };
  const agregar = (ids: string[]) => {
    p.setElegidas((s) => new Set([...s, ...ids]));
    p.setSemanas(mensual ? 4 : 1);
    p.setFiltros({ donde: 'todo', cuando: 'cualquiera' });
    irA('espacios');
  };
  return (
    <section id="paquetes">
      <div className="wrap">
        <div className="sec-head c rv">
          <span className="label">Paquetes</span>
          <h2>
            Empieza con un <span className="tape">paquete</span>, ajústalo a tu medida
          </h2>
          <p>Armados sobre la programación real del circuito. Incluyen revisión humana del spot, seguimiento y certificado.{t?.esEjemplo && ' Precios de ejemplo.'}</p>
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
                <Foto img={FOTO_PAQUETE[pl.clave] ?? IMAGENES.microfonoEstudio} sizes="(max-width: 900px) 100vw, 380px" className="plan-foto" />
                {pl.destacado && <span className="badge">Recomendado para empezar</span>}
                <span className="label">{pl.etiqueta}</span>
                <h3>{pl.nombre}</h3>
                <p className="desc">{pl.desc}</p>
                <div>
                  <span className="price">{pr ? dinero(pr.totalCentimos, pr.moneda) : '—'}</span> <span className="per">{mensual ? 'por 4 semanas' : 'por semana'}</span>
                </div>
                <ul>
                  <li>{pr ? `${pr.emisiones} spots ${mensual ? 'en 4 semanas' : 'por semana'}` : 'Sin espacios en estas fechas'}</li>
                  {pl.puntos.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                  {pr && pr.descuentoBps > 0 && <li>Incluye {pr.descuentoBps / 100} % por volumen</li>}
                </ul>
                <button className="btn" type="button" onClick={() => agregar(pl.ids)}>
                  Agregar a mi pauta <span className="arrow">→</span>
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── cotizador: la parrilla hora por hora, con la emisora sonando en el dial ──
export function Cotizador({ datos }: { datos: DatosVenta }) {
  const c = useCotizacion(datos);
  const { p, t, franjas, emisiones, precio } = c;
  const radio = useRadio();
  const [emisora, setEmisora] = useState('caracas');
  const actual = datos.emisoras.find((e) => e.slug === emisora);

  // Si la radio está sonando, al cambiar de emisora en el dial cambia también la señal.
  useEffect(() => {
    if (!actual?.streamUrl || !radio.actual || radio.actual.slug === actual.slug) return;
    if (radio.estado === 'sonando' || radio.estado === 'conectando') radio.alternar({ ...actual, streamUrl: actual.streamUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual]);

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
  const [rotulo, setRotulo] = useState<{ t: string; s: string }>({ t: 'Buscando señal', s: ' ' });
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    let vivo = true;
    const medir = () => {
      const r = cv.getBoundingClientRect();
      cv.width = r.width * devicePixelRatio;
      cv.height = r.height * devicePixelRatio;
    };
    medir();
    addEventListener('resize', medir);
    const onda = (tm: number) => {
      if (!vivo) return;
      const w = cv.width,
        h = cv.height,
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
    setRotulo({ t: 'Sintonizando…', s: ' ' });
    const paso = (now: number) => {
      if (mio !== T.token) return;
      const pr = dur ? Math.min(1, (now - t0) / dur) : 1;
      T.f = desde + (hasta - desde) * ease(pr);
      T.ruido = reduce ? 0 : pr < 1 ? Math.min(1, 0.4 + Math.abs(hasta - T.f) / 2.5) : Math.max(0, T.ruido - 0.05);
      if (tf.current) tf.current.textContent = T.f.toFixed(1);
      if (pr < 1 || T.ruido > 0) requestAnimationFrame(paso);
      else setRotulo({ t: actual.ciudad, s: `${actual.nombre} · ${actual.frecuencia}` });
    };
    requestAnimationFrame(paso);
  }, [actual]);

  // ── parrilla de la emisora: filas por programa y horario, columnas por día ──
  const filas = useMemo(() => {
    const pa = datos.parrillas[emisora];
    if (!pa) return [];
    const m = new Map<string, { programa: string; alcance: 'nacional' | 'local'; inicio: string; fin: string; dias: Map<number, string> }>();
    for (const pr of pa.programas) {
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
    c.setError(null);
    const agregar = !p.elegidas.has(id);
    p.setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    if (agregar) {
      const box = caja.current;
      if (box) {
        const r = box.getBoundingClientRect();
        chispas(box, ev.clientX - r.left + box.scrollLeft, ev.clientY - r.top);
      }
      tono.current.ruido = Math.max(tono.current.ruido, 0.7);
    }
  };

  const localesPor = (slug: string) => [...p.elegidas].filter((id) => franjas.get(id)?.emisora === slug).length;
  const nNac = emisiones.filter((e) => e.alcance === 'nacional').length;
  const nLoc = emisiones.length - nNac;
  const ciudades = new Set([...p.elegidas].map((id) => franjas.get(id)?.emisora).filter(Boolean));

  // ── mantener para confirmar → crea la cotización real ──────────────────────
  const hold = useRef<HTMLButtonElement>(null);
  const [lista, setLista] = useState(false);
  useEffect(() => {
    const b = hold.current!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pr = 0,
      sosteniendo = false,
      ultimo = 0,
      hecho = false;
    const bucle = (now: number) => {
      const dt = (now - ultimo) / 1000;
      ultimo = now;
      if (hecho) return;
      pr = sosteniendo ? Math.min(1, pr + dt / (reduce ? 0.2 : 1.1)) : Math.max(0, pr - dt * 2.5);
      b.style.setProperty('--p', String(pr));
      if (pr >= 1) {
        hecho = true;
        b.classList.add('done');
        const r = b.getBoundingClientRect();
        chispas(b, r.width / 2, r.height / 2);
        setLista(true);
        b.dispatchEvent(new CustomEvent('confirmado'));
        setTimeout(() => {
          hecho = false;
          pr = 0;
          b.classList.remove('done');
          b.style.setProperty('--p', '0');
        }, 2500);
        return;
      }
      if (sosteniendo || pr > 0) requestAnimationFrame(bucle);
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
  const confirmarRef = useRef(c.confirmar);
  confirmarRef.current = c.confirmar;
  useEffect(() => {
    const b = hold.current!;
    const f = () => confirmarRef.current(() => setLista(false));
    b.addEventListener('confirmado', f);
    return () => b.removeEventListener('confirmado', f);
  }, []);

  return (
    <section id="cotizar" style={{ paddingTop: 20 }}>
      <div className="wrap">
        <div className="sec-head rv">
          <span className="label">Cotizador</span>
          <h2>
            La programación es tu <span className="tape r">calendario</span>
          </h2>
          <p>Elige una emisora, escúchala en vivo y toca las horas en las que quieres sonar. Las celdas en naranja son programas en cadena nacional: suenan en las diez emisoras a la vez.</p>
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
          {actual && <BotonVivo emisora={actual} compacto />}
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
                          aria-pressed={p.elegidas.has(id)}
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
              {t?.esEjemplo && <span className="ex">tarifas de ejemplo</span>}
            </div>
            <button className="hold" ref={hold} type="button" disabled={!t || emisiones.length === 0 || c.enviando} aria-label="Mantén presionado para cotizar tu pauta">
              <span className="fill" aria-hidden="true" />
              <span className="lbl">{c.enviando || lista ? 'Cotizando…' : 'Mantén para cotizar'}</span>
            </button>
          </div>
        </div>
        {c.error && (
          <div className="aviso error cot-error" role="alert">
            {c.error}
          </div>
        )}
      </div>
    </section>
  );
}
