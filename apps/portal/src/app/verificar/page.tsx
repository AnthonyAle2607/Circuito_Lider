import { verificarCorreo } from '../acciones';

export const metadata = { title: 'Confirmar correo · Invermedia Radio', robots: { index: false } };

export default async function Verificar({ searchParams }: { searchParams: Promise<{ codigo?: string; error?: string }> }) {
  const q = await searchParams;
  return (
    <main className="pagina">
      <div className="wrap angosta">
        <span className="label">Tu cuenta</span>
        <h1>Confirma tu correo</h1>
        {q.error && <div className="aviso error" role="alert">{q.error}</div>}
        {q.codigo ? (
          <form action={verificarCorreo} className="tarjeta">
            <input type="hidden" name="codigo" value={q.codigo} />
            <p style={{ marginTop: 0 }}>Un toque más y tu cuenta queda lista para reservar.</p>
            <button className="btn primary" type="submit">
              Confirmar mi correo <span className="arrow">→</span>
            </button>
          </form>
        ) : (
          !q.error && <p className="intro">Abre el enlace que te enviamos por correo.</p>
        )}
      </div>
    </main>
  );
}
