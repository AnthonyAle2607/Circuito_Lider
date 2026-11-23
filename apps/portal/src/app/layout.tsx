import type { ReactNode } from 'react';
import { Cabecera } from '@/componentes/Cabecera';
import { Pie } from '@/componentes/Pie';
import { PautaProvider } from '@/componentes/Pauta';
import { proximosLunes } from '@/lib/fechas';
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
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';
import '@fontsource/roboto-mono/700.css';
// Estilos por pieza (ver docs/arquitectura-portal.md). tokens.css primero: define los temas claro y oscuro.
import './estilos/tokens.css';
import './estilos/base.css';
import './estilos/marco.css';
import './estilos/heroe.css';
import './estilos/tienda.css';
import './estilos/secciones.css';
import './estilos/cotizador.css';
import './estilos/tono.css';
import './estilos/cuenta.css';
import './estilos/emisoras.css';

export function generateMetadata() {
  const m = leerMarca();
  return { title: m.nombre, description: m.lema };
}

export default async function Marco({ children }: { children: ReactNode }) {
  const conSesion = Boolean(await sesionActual());
  return (
    <html lang="es">
      <body>
        <RadioProvider>
          <PautaProvider lunesOpciones={proximosLunes(6)}>
            <Cabecera conSesion={conSesion} />
            {children}
            <Pie />
          </PautaProvider>
        </RadioProvider>
      </body>
    </html>
  );
}
