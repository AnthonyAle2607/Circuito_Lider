import type { ReactNode } from 'react';
import { Cabecera } from '@/componentes/Cabecera';
import { Pie } from '@/componentes/Pie';
import { RadioProvider } from '@/componentes/Radio';
import { leerMarca } from '@/lib/marca';
import { sesionActual } from '@/lib/sesion';
// Tipografías empaquetadas con el portal (@fontsource): el visitante no se conecta a Google y compilar no
// depende de la red (next/font/google las descargaba en cada build y a veces fallaba en la CI).
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/800.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';
import '@fontsource/roboto-mono/700.css';
import './estilos/parrilla.css';
import './estilos/portal.css';

export function generateMetadata() {
  const m = leerMarca();
  return { title: m.nombre, description: m.lema };
}

export default async function Marco({ children }: { children: ReactNode }) {
  const conSesion = Boolean(await sesionActual());
  return (
    // suppressHydrationWarning: el script del <head> añade la clase «js» antes de que React hidrate (es a propósito).
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Las piezas que aparecen al hacer scroll se ocultan solo si hay JavaScript (patrón de la maqueta). */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <RadioProvider>
          <Cabecera conSesion={conSesion} />
          {children}
          <Pie />
        </RadioProvider>
      </body>
    </html>
  );
}
