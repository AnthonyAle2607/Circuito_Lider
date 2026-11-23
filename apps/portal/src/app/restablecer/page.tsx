import Link from 'next/link';
import { restablecerClave } from '../acciones-clave';

export const metadata = { title: 'Clave nueva · Invermedia Radio', robots: { index: false } };

/** Crear la clave nueva desde el enlace del correo. */
export default async function Restablecer({ searchParams }: { searchParams: Promise<{ codigo?: string; error?: string }> }) {
  const q = await searchParams;
  if (!q.codigo) {
    return (
      <main className="pagina">
        <div className="wrap angosta">
          <h1>Enlace incompleto</h1>
          <p className="intro">
            Abre el enlace completo del correo, o <Link href="/recuperar">pide uno nuevo</Link>.
          </p>
        </div>
      </main>
    );
  }
  return (
    <main className="pagina">
      <div className="wrap angosta">
        <span className="label">Tu cuenta</span>
        <h1>Clave nueva</h1>
        <p className="intro">Al guardarla se cierran las sesiones abiertas en otros equipos.</p>
        {q.error && (
          <div className="aviso error" role="alert">
            {q.error} {q.error.includes('venció') && <Link href="/recuperar">Pedir otro enlace</Link>}
          </div>
        )}
        <form action={restablecerClave} className="tarjeta">
          <input type="hidden" name="codigo" value={q.codigo} />
          <div className="campo">
            <label htmlFor="password">Clave nueva</label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required autoFocus />
            <small>Al menos 12 caracteres.</small>
          </div>
          <div className="campo">
            <label htmlFor="confirmar">Repite la clave</label>
            <input id="confirmar" name="confirmar" type="password" autoComplete="new-password" minLength={12} required />
          </div>
          <button className="btn primary" type="submit">
            Guardar la clave <span className="arrow">→</span>
          </button>
        </form>
      </div>
    </main>
  );
}
