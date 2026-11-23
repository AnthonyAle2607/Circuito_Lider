import Link from 'next/link';
import { ingresar } from '../acciones';

export const metadata = { title: 'Ingresar · Invermedia Radio' };

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ siguiente?: string; error?: string; verificado?: string; clave?: string }> }) {
  const q = await searchParams;
  const siguiente = q.siguiente ?? '/cuenta';
  return (
    <main className="pagina">
      <div className="wrap angosta">
        <span className="label">Tu cuenta</span>
        <h1>Ingresar</h1>
        <p className="intro">Para reservar y seguir tus pautas.</p>
        {q.verificado && <div className="aviso ok" role="status">✓ Correo confirmado. Ya puedes ingresar.</div>}
        {q.clave && <div className="aviso ok" role="status">✓ Clave nueva guardada. Ingresa con ella.</div>}
        {q.error && <div className="aviso error" role="alert">{q.error}</div>}
        <form action={ingresar} className="tarjeta">
          <input type="hidden" name="siguiente" value={siguiente} />
          <div className="campo">
            <label htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <div className="campo">
            <label htmlFor="password">Clave</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <div className="acciones">
            <button className="btn primary" type="submit">
              Ingresar <span className="arrow">→</span>
            </button>
            <Link href={`/registro?siguiente=${encodeURIComponent(siguiente)}`}>¿No tienes cuenta? Créala</Link>
            <Link href="/recuperar">¿Olvidaste tu clave?</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
