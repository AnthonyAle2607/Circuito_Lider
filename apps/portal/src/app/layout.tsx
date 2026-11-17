import type { ReactNode } from 'react';
import { leerMarca } from '@/lib/marca';

export function generateMetadata() {
  const m = leerMarca();
  return { title: m.nombre, description: m.lema };
}

export default function Marco({ children }: { children: ReactNode }) {
  const { colores: c } = leerMarca();
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          background: c.fondo,
          color: c.texto,
          fontFamily: 'Roboto, system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
