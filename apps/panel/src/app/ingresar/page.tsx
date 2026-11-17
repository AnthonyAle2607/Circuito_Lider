import { cookies } from 'next/headers';
import { enviarCodigo, ingresar } from '../acciones';
import { leerMarca } from '@/lib/marca';
import { COOKIE_RETO } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ paso?: string; error?: string; vencida?: string }> }) {
  const q = await searchParams;
  const c = leerMarca().colores;
  const pideCodigo = q.paso === 'codigo' && Boolean((await cookies()).get(COOKIE_RETO));
  const campo = { display: 'block', width: '100%', boxSizing: 'border-box' as const, padding: '12px', marginTop: 6, borderRadius: 6, border: `1px solid ${c.texto_suave}`, background: c.fondo, color: c.texto, fontSize: 16 };
  const boton = { marginTop: 20, width: '100%', padding: '12px', borderRadius: 999, border: 0, background: c.acento, color: c.fondo, fontWeight: 700, fontSize: 16, cursor: 'pointer' };

  return (
    <main style={{ maxWidth: 400, margin: '0 auto', padding: '64px 16px' }}>
      <p style={{ color: c.acento, letterSpacing: 2, textTransform: 'uppercase', fontSize: 13 }}>Panel del equipo</p>
      <h1 style={{ fontFamily: 'Oswald, Impact, sans-serif', margin: '8px 0 24px' }}>{pideCodigo ? 'Código de verificación' : 'Ingresar'}</h1>
      {q.vencida && !q.error && <p role="status" style={{ color: c.texto_suave }}>Tu sesión venció. Ingresa de nuevo.</p>}
      {q.error && <p role="alert" style={{ color: c.alerta }}>{q.error}</p>}

      {pideCodigo ? (
        <form action={enviarCodigo} style={{ background: c.superficie, padding: 20, borderRadius: 8 }}>
          <label htmlFor="codigo">Escribe el código de 6 dígitos de tu aplicación de autenticación</label>
          <input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus style={{ ...campo, letterSpacing: 8, fontSize: 24, textAlign: 'center' }} />
          <button type="submit" style={boton}>Entrar</button>
        </form>
      ) : (
        <form action={ingresar} style={{ background: c.superficie, padding: 20, borderRadius: 8 }}>
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" autoComplete="username" required autoFocus style={campo} />
          <label htmlFor="password" style={{ display: 'block', marginTop: 16 }}>Clave</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required style={campo} />
          <button type="submit" style={boton}>Continuar</button>
        </form>
      )}
    </main>
  );
}
