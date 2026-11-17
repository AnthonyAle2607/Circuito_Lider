import Link from 'next/link';
import { Emisora, Parrilla } from '@sp/schemas';
import { editarFranja, salir } from '../acciones';
import { leerMarca } from '@/lib/marca';
import { API_URL, apiEquipo } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Programación corrige la parrilla de cada emisora: horario, segundos de tanda, si se vende y si el cupo está confirmado. */
export default async function PanelParrilla({ searchParams }: { searchParams: Promise<{ emisora?: string; aviso?: string; error?: string }> }) {
  const q = await searchParams;
  const slug = q.emisora ?? 'caracas';
  const c = leerMarca().colores;

  const lista = Emisora.array().parse(await (await fetch(`${API_URL}/v1/emisoras`, { cache: 'no-store' })).json());
  const r = await apiEquipo(`/v1/panel/franjas?emisora=${encodeURIComponent(slug)}`);
  if (r.status === 403) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 16px' }}>
        <p role="alert">Tu rol no permite editar la parrilla. Pide acceso a programación o gerencia.</p>
      </main>
    );
  }
  const p = Parrilla.parse(await r.json());
  const filas = p.programas
    .flatMap((pr) => pr.franjas.map((f) => ({ ...f, programa: pr.nombre, alcance: pr.alcance })))
    .sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio));
  const estimadas = filas.filter((f) => !f.cupoConfirmado).length;

  const celda = { padding: '6px 8px', borderBottom: `1px solid ${c.fondo}`, verticalAlign: 'middle' as const };
  const entrada = { background: c.fondo, color: c.texto, border: `1px solid ${c.texto_suave}`, borderRadius: 4, padding: '4px 6px', fontSize: 14 };

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px 64px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: c.acento, letterSpacing: 2, textTransform: 'uppercase', fontSize: 13, margin: 0 }}>Panel · Parrilla y cupos</p>
          <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', margin: '4px 0' }}>{p.emisora.nombre} · {p.emisora.frecuencia}</h1>
        </div>
        <form action={salir}>
          <button type="submit" style={{ background: 'transparent', color: c.texto_suave, border: `1px solid ${c.texto_suave}`, borderRadius: 999, padding: '6px 14px', cursor: 'pointer' }}>Salir</button>
        </form>
      </header>

      <nav aria-label="Emisoras" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '16px 0' }}>
        {lista.map((e) => (
          <Link key={e.slug} href={`/parrilla?emisora=${e.slug}`} aria-current={e.slug === slug ? 'page' : undefined}
            style={{ padding: '6px 10px', borderRadius: 999, fontSize: 13, textDecoration: 'none', background: e.slug === slug ? c.acento : c.superficie, color: e.slug === slug ? c.fondo : c.texto }}>
            {e.ciudad}
          </Link>
        ))}
      </nav>

      {q.aviso && <p role="status" style={{ color: c.acento }}>{q.aviso}</p>}
      {q.error && <p role="alert" style={{ color: c.alerta }}>{q.error}</p>}
      <p style={{ color: c.texto_suave, fontSize: 14 }}>
        {estimadas} de {filas.length} franjas tienen la tanda <strong>estimada</strong> (sin confirmar con la emisora). Los cambios en programas en cadena afectan a las 9 emisoras. Cada cambio queda en la bitácora.
      </p>

      <div style={{ overflowX: 'auto', background: c.superficie, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 760 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: c.texto_suave }}>
              {['Día', 'Programa', 'Inicio', 'Fin', 'Tanda (s)', 'Se vende', 'Confirmado', ''].map((h) => <th key={h} style={celda}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const formId = `form-${f.id}`;
              return (
                <tr key={f.id} id={`f-${f.id}`} style={{ opacity: f.activa ? 1 : 0.55 }}>
                  <td style={celda}>{DIAS[f.dia - 1]}</td>
                  <td style={celda}>
                    {f.programa} <span style={{ fontSize: 11, color: f.alcance === 'nacional' ? c.acento : c.texto_suave }}>{f.alcance === 'nacional' ? 'EN CADENA' : 'LOCAL'}</span>
                    <form id={formId} action={editarFranja}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="emisora" value={slug} />
                      <input type="hidden" name="inicio_antes" value={f.inicio} />
                      <input type="hidden" name="fin_antes" value={f.fin === '24:00' ? '00:00' : f.fin} />
                      <input type="hidden" name="segundos_antes" value={f.segundosTanda} />
                      <input type="hidden" name="activa_antes" value={String(f.activa)} />
                      <input type="hidden" name="confirmado_antes" value={String(f.cupoConfirmado)} />
                    </form>
                  </td>
                  <td style={celda}><input form={formId} aria-label="Inicio" name="inicio" type="time" defaultValue={f.inicio} style={entrada} /></td>
                  <td style={celda}><input form={formId} aria-label="Fin" name="fin" type="time" defaultValue={f.fin === '24:00' ? '00:00' : f.fin} style={entrada} /></td>
                  <td style={celda}><input form={formId} aria-label="Segundos de tanda" name="segundosTanda" type="number" min={0} max={3600} defaultValue={f.segundosTanda} style={{ ...entrada, width: 80 }} /></td>
                  <td style={celda}><input form={formId} aria-label="Se vende" name="activa" type="checkbox" defaultChecked={f.activa} /></td>
                  <td style={celda}><input form={formId} aria-label="Cupo confirmado" name="cupoConfirmado" type="checkbox" defaultChecked={f.cupoConfirmado} /></td>
                  <td style={celda}>
                    <button form={formId} type="submit" style={{ background: c.acento, color: c.fondo, border: 0, borderRadius: 999, padding: '6px 12px', fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: c.texto_suave, fontSize: 13 }}>Una franja que termina a medianoche se escribe con fin 00:00.</p>
    </main>
  );
}
