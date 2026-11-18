import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Parrilla } from '@sp/schemas';
import { emisoras, parrilla } from '@/lib/api';
import { leerMarca } from '@/lib/marca';

export const dynamic = 'force-dynamic';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

type Bloque = { programa: string; alcance: 'nacional' | 'local'; locutores: string | null; inicio: string; fin: string; segundos: number; confirmado: boolean };

/** Agrupa las franjas por día, ordenadas por hora. */
function porDia(p: Parrilla): Bloque[][] {
  const dias: Bloque[][] = DIAS.map(() => []);
  for (const pr of p.programas) {
    for (const f of pr.franjas) {
      dias[f.dia - 1]!.push({
        programa: pr.nombre,
        alcance: pr.alcance,
        locutores: pr.locutores,
        inicio: f.inicio,
        fin: f.fin,
        segundos: f.segundosTanda,
        confirmado: f.cupoConfirmado,
      });
    }
  }
  for (const d of dias) d.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return dias;
}

/** PT-2: la parrilla real de cada emisora, leída de la base. El diseño final (Parrilla, Consola o Aló) llega en PT-4. */
export default async function PaginaParrilla({ searchParams }: { searchParams: Promise<{ emisora?: string }> }) {
  const { emisora: slug = 'caracas' } = await searchParams;
  const [lista, p] = await Promise.all([emisoras(), parrilla(slug)]);
  if (!p) notFound();
  const c = leerMarca().colores;
  const dias = porDia(p);

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 16px 64px' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: c.texto_suave }}>← Inicio</Link>
      </p>
      <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', fontSize: 'clamp(32px, 6vw, 56px)', margin: '16px 0 4px' }}>
        La parrilla
      </h1>
      <p style={{ color: c.texto_suave, marginTop: 0 }}>
        Elige la emisora y mira dónde puede sonar tu anuncio. Horas de Venezuela (UTC−4).
      </p>

      <nav aria-label="Emisoras" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '24px 0' }}>
        {lista.map((e) => {
          const actual = e.slug === p.emisora.slug;
          return (
            <Link
              key={e.slug}
              href={`/parrilla?emisora=${e.slug}`}
              aria-current={actual ? 'page' : undefined}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                textDecoration: 'none',
                fontSize: 14,
                border: `1px solid ${actual ? c.acento : c.superficie}`,
                background: actual ? c.acento : c.superficie,
                color: actual ? c.fondo : c.texto,
              }}
            >
              {e.ciudad} <span style={{ opacity: 0.7 }}>{e.frecuencia.replace(' FM', '')}</span>
            </Link>
          );
        })}
      </nav>

      <h2 style={{ fontFamily: 'Oswald, Impact, sans-serif', fontWeight: 500, margin: '0 0 4px' }}>
        {p.emisora.nombre} · {p.emisora.frecuencia}
      </h2>
      <p style={{ color: c.texto_suave, fontSize: 14, margin: '0 0 24px' }}>
        <span style={{ color: c.acento }}>■</span> En cadena: suena en las 10 ciudades a la vez ·{' '}
        <span style={{ color: c.alerta }}>■</span> Local: solo en {p.emisora.ciudad}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {dias.map((bloques, i) => (
          <section key={DIAS[i]} aria-label={DIAS[i]} style={{ background: c.superficie, borderRadius: 8, padding: 12, minHeight: 120 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: c.texto_suave }}>{DIAS[i]}</h3>
            {bloques.length === 0 && <p style={{ color: c.texto_suave, fontSize: 13, margin: 0 }}>Música continua</p>}
            {bloques.map((b) => (
              <article
                key={`${b.programa}-${b.inicio}`}
                style={{ borderLeft: `3px solid ${b.alcance === 'nacional' ? c.acento : c.alerta}`, padding: '4px 0 4px 8px', marginBottom: 8 }}
              >
                <div style={{ fontSize: 12, color: c.texto_suave }}>{b.inicio}–{b.fin === '24:00' ? '00:00' : b.fin}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{b.programa}</div>
                {b.locutores && <div style={{ fontSize: 12, color: c.texto_suave }}>{b.locutores}</div>}
              </article>
            ))}
          </section>
        ))}
      </div>

      <p style={{ color: c.texto_suave, fontSize: 13, marginTop: 24 }}>
        Las horas sin programa son música continua; se podrán reservar más adelante. Los cupos de tanda están por confirmar con la emisora.
      </p>
    </main>
  );
}
