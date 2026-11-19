'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECCIONES: Array<{ href: string; texto: string; activa: (p: string) => boolean }> = [
  { href: '/cuenta', texto: 'Resumen', activa: (p) => p === '/cuenta' },
  { href: '/cuenta/campanas', texto: 'Campañas', activa: (p) => p.startsWith('/cuenta/campanas') || p.startsWith('/cuenta/pedidos') },
  { href: '/cuenta/anuncios', texto: 'Mis anuncios', activa: (p) => p.startsWith('/cuenta/anuncios') },
  { href: '/cuenta/pagos', texto: 'Pagos', activa: (p) => p.startsWith('/cuenta/pagos') },
  { href: '/cuenta/certificados', texto: 'Certificados', activa: (p) => p.startsWith('/cuenta/certificados') },
  { href: '/cuenta/empresa', texto: 'Empresa', activa: (p) => p.startsWith('/cuenta/empresa') },
  { href: '/cuenta/seguridad', texto: 'Mi perfil y clave', activa: (p) => p.startsWith('/cuenta/seguridad') },
];

/** Menú lateral del panel del anunciante (en teléfonos se vuelve una fila que se desliza). */
export function MenuCuenta() {
  const p = usePathname() ?? '/cuenta';
  return (
    <nav className="menu-cuenta" aria-label="Secciones de tu panel">
      {SECCIONES.map((s) => (
        <Link key={s.href} href={s.href} aria-current={s.activa(p) ? 'page' : undefined}>
          {s.texto}
        </Link>
      ))}
    </nav>
  );
}
