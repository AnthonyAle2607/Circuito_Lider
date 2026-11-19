import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Yo } from '@sp/schemas';
import { MenuCuenta } from '@/componentes/MenuCuenta';
import { api, exigirSesion } from '@/lib/sesion';
import { salir } from '../acciones';

export const dynamic = 'force-dynamic';

/** Marco del panel del anunciante: quién eres, el menú de secciones y el aviso de correo sin confirmar. */
export default async function LayoutCuenta({ children }: { children: ReactNode }) {
  await exigirSesion('/cuenta');
  const r = await api('/v1/cuentas/yo', { conSesion: true });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta');
  const y = Yo.parse(r.datos);

  return (
    <main className="pagina panel-cuenta">
      <div className="wrap">
        <div className="panel-rejilla">
          <aside className="panel-lado">
            <div className="panel-quien">
              <span className="label">Tu panel</span>
              <b>{y.anunciante.empresa}</b>
              <span>{y.usuario.nombre}</span>
            </div>
            <MenuCuenta />
            <form action={salir}>
              <button className="btn salir" type="submit">
                Cerrar sesión
              </button>
            </form>
          </aside>
          <section className="panel-cuerpo">
            {!y.usuario.correoVerificado && (
              <div className="aviso ejemplo" role="status">
                Confirma tu correo con el enlace que te enviamos: lo necesitas para reservar.
              </div>
            )}
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
