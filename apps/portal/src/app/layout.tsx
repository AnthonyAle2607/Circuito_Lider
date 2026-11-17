import type { ReactNode } from 'react';
import { Oswald, Roboto, Roboto_Mono } from 'next/font/google';
import { Cabecera } from '@/componentes/Cabecera';
import { Pie } from '@/componentes/Pie';
import { leerMarca } from '@/lib/marca';
import { sesionActual } from '@/lib/sesion';
import './estilos/parrilla.css';
import './estilos/portal.css';

// Tipografías servidas por el propio portal (next/font): el visitante no se conecta a Google.
const oswald = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-oswald', display: 'swap' });
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700', '800'], variable: '--font-roboto', display: 'swap' });
const mono = Roboto_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto-mono', display: 'swap' });

export function generateMetadata() {
  const m = leerMarca();
  return { title: m.nombre, description: m.lema };
}

export default async function Marco({ children }: { children: ReactNode }) {
  const conSesion = Boolean(await sesionActual());
  return (
    // suppressHydrationWarning: el script del <head> añade la clase «js» antes de que React hidrate (es a propósito).
    <html lang="es" className={`${oswald.variable} ${roboto.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Las piezas que aparecen al hacer scroll se ocultan solo si hay JavaScript (patrón de la maqueta). */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <Cabecera conSesion={conSesion} />
        {children}
        <Pie />
      </body>
    </html>
  );
}
