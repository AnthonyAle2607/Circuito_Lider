import { estadoDelServidor } from '@/lib/api';
import { leerMarca } from '@/lib/marca';

export const dynamic = 'force-dynamic';

/** PT-0: página de arranque. Las bandejas por rol llegan desde PT-1 (acceso con doble factor). */
export default async function Inicio() {
  const m = leerMarca();
  const estado = await estadoDelServidor();
  const c = m.colores;
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 16px' }}>
      <p style={{ color: c.acento, letterSpacing: 2, textTransform: 'uppercase', fontSize: 13 }}>Panel del equipo</p>
      <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', fontSize: 'clamp(40px, 8vw, 72px)', margin: '8px 0' }}>{m.nombre}</h1>
      <p style={{ color: c.texto_suave, fontSize: 18 }}>Herramienta interna de Invermedia. En construcción.</p>
      <section style={{ marginTop: 40, padding: 16, background: c.superficie, borderRadius: 8 }}>
        <strong>Servidor: </strong>
        {estado === null ? (
          <span style={{ color: c.alerta }}>no responde</span>
        ) : (
          <span style={{ color: estado.ok ? c.acento : c.alerta }}>
            {estado.ok ? 'en pie' : 'con fallas'} ·{' '}
            {Object.entries(estado.dependencias)
              .map(([n, e]) => `${n} ${e === 'ok' ? 'ok' : 'caída'}`)
              .join(' · ')}
          </span>
        )}
      </section>
    </main>
  );
}
