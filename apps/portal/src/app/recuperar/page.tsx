import Link from 'next/link';
import { pedirRecuperacion } from '../acciones-clave';

export const metadata = { title: 'Recuperar la clave · Invermedia Radio' };

/** Pedir el enlace para crear una clave nueva. */
export default async function Recuperar({ searchParams }: { searchParams: Promise<{ enviado?: string; error?: string }> }) {
  const q = await searchParams;
  return (
    <main className="pagina">
      <div className="wrap angosta">
        <span className="label">Tu cuenta</span>
        <h1>Recuperar la clave</h1>
        {q.enviado ? (
          <div className="tarjeta" role="status">
            <p style={{ marginTop: 0 }}>Si el correo tiene una cuenta, te enviamos un enlace para crear una clave nueva. Vence en 1 hora.</p>
            <p className="nota" style={{ marginBottom: 0 }}>
              ¿No llegó? Revisa la carpeta de spam o <Link href="/recuperar">pídelo otra vez</Link>.
            </p>
          </div>
        ) : (
          <>
            <p className="intro">Escribe el correo de tu cuenta y te mandamos un enlace para crear una clave nueva.</p>
            {q.error && <div className="aviso error" role="alert">{q.error}</div>}
            <form action={pedirRecuperacion} className="tarjeta">
              <div className="campo">
                <label htmlFor="email">Correo</label>
                <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
              </div>
              <div className="acciones">
                <button className="btn primary" type="submit">
                  Enviar el enlace <span className="arrow">→</span>
                </button>
                <Link href="/ingresar">Volver a ingresar</Link>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
