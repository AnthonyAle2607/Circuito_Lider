import Link from 'next/link';
import { PAISES } from '@/lib/paises';
import { registrarse } from '../acciones';

export const metadata = { title: 'Crear cuenta · Invermedia Radio' };

export default async function Registro({ searchParams }: { searchParams: Promise<{ siguiente?: string; error?: string }> }) {
  const q = await searchParams;
  const siguiente = q.siguiente ?? '/cuenta';
  return (
    <main className="pagina">
      <div className="wrap angosta">
        <span className="label">Tu cuenta</span>
        <h1>Crear cuenta</h1>
        <p className="intro">Para reservar tus espacios y seguir cada emisión. Cotizar no la necesita.</p>
        {q.error && <div className="aviso error" role="alert">{q.error}</div>}
        <form action={registrarse} className="tarjeta">
          <input type="hidden" name="siguiente" value={siguiente} />
          <div className="campo">
            <label htmlFor="empresa">Empresa o marca</label>
            <input id="empresa" name="empresa" autoComplete="organization" required maxLength={200} />
          </div>
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="nombre">Tu nombre</label>
              <input id="nombre" name="nombre" autoComplete="name" required maxLength={200} />
            </div>
            <div className="campo">
              <label htmlFor="pais">País</label>
              <select id="pais" name="pais" required defaultValue="US">
                {PAISES.map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="campo">
            <label htmlFor="password">Clave</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
            <small>Al menos 12 caracteres.</small>
          </div>
          <div className="acciones">
            <button className="btn primary" type="submit">
              Crear cuenta <span className="arrow">→</span>
            </button>
            <Link href={`/ingresar?siguiente=${encodeURIComponent(siguiente)}`}>Ya tengo cuenta</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
