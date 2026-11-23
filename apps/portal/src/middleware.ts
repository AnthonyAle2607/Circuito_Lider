import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESION } from '@/lib/cookie-sesion';

/**
 * Enlaces profundos al panel (`/cuenta/anuncios`, `/cuenta/pautas/…`): sin sesión, manda a ingresar y conserva la
 * ruta pedida en `siguiente`, para volver a ella después. La validez real del token la comprueba la API; esto solo
 * evita que el layout de la cuenta pierda la ruta original.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.has(COOKIE_SESION)) return NextResponse.next();
  const destino = new URL('/ingresar', req.url);
  destino.searchParams.set('siguiente', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(destino);
}

export const config = { matcher: ['/cuenta/:path*'] };
