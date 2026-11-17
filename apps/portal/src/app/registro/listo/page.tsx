import Link from 'next/link';

export const metadata = { title: 'Revisa tu correo · Invermedia Radio' };

export default async function RegistroListo({ searchParams }: { searchParams: Promise<{ email?: string; siguiente?: string }> }) {
  const q = await searchParams;
  return (
    <main className="pagina">
      <div className="wrap angosta">
        <span className="label">Casi listo</span>
        <h1>Revisa tu correo</h1>
        <p className="intro">
          Te enviamos un enlace a <b>{q.email ?? 'tu correo'}</b> para confirmarlo. Ábrelo y vuelve para reservar. Mientras tanto puedes ingresar y seguir
          cotizando.
        </p>
        <div className="acciones">
          <Link className="btn primary" href={`/ingresar?siguiente=${encodeURIComponent(q.siguiente ?? '/cuenta')}`}>
            Ingresar <span className="arrow">→</span>
          </Link>
          <Link className="btn" href="/#cotizar">
            Seguir cotizando
          </Link>
        </div>
      </div>
    </main>
  );
}
