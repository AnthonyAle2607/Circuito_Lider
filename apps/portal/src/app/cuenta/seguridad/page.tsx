import { redirect } from 'next/navigation';
import { Yo } from '@sp/schemas';
import { api } from '@/lib/sesion';
import { cambiarClave, guardarPerfil } from '../../acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi perfil y clave · Invermedia Radio', robots: { index: false } };

const AVISOS: Record<string, string> = {
  perfil: 'Nombre guardado.',
  clave: 'Clave cambiada. Cerramos tus otras sesiones abiertas; esta sigue activa.',
};

export default async function Seguridad({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const q = await searchParams;
  const r = await api('/v1/cuentas/yo', { conSesion: true });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/seguridad');
  const u = Yo.parse(r.datos).usuario;

  return (
    <>
      <h1>Mi perfil y clave</h1>
      <p className="intro">Tu nombre y la clave con la que entras a este panel.</p>
      {q.ok && AVISOS[q.ok] && <div className="aviso ok" role="status">{AVISOS[q.ok]}</div>}
      {q.error && <div className="aviso error" role="alert">{q.error}</div>}

      <form action={guardarPerfil} className="tarjeta formulario">
        <h2 className="sub" style={{ marginTop: 0 }}>Perfil</h2>
        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input id="email" value={u.email} readOnly disabled />
          <small>{u.correoVerificado ? 'Confirmado.' : 'Sin confirmar: revisa tu bandeja de entrada.'}</small>
        </div>
        <div className="campo">
          <label htmlFor="nombre">Tu nombre</label>
          <input id="nombre" name="nombre" autoComplete="name" required maxLength={200} defaultValue={u.nombre} />
        </div>
        <div className="acciones">
          <button className="btn primary" type="submit">
            Guardar nombre
          </button>
        </div>
      </form>

      <form action={cambiarClave} className="tarjeta formulario">
        <h2 className="sub" style={{ marginTop: 0 }}>Cambiar clave</h2>
        <div className="campo">
          <label htmlFor="actual">Clave actual</label>
          <input id="actual" name="actual" type="password" autoComplete="current-password" required maxLength={128} />
        </div>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="nueva">Clave nueva</label>
            <input id="nueva" name="nueva" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
            <small>Al menos 12 caracteres.</small>
          </div>
          <div className="campo">
            <label htmlFor="repetir">Repite la clave nueva</label>
            <input id="repetir" name="repetir" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          </div>
        </div>
        <div className="acciones">
          <button className="btn primary" type="submit">
            Cambiar clave
          </button>
        </div>
      </form>
    </>
  );
}
