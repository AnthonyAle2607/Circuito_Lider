import Link from 'next/link';

export function Pie() {
  return (
    <footer className="pie">
      <div className="wrap">
        <span>INVERMEDIA · Radio en Circuito Líder</span>
        <span>
          Precios de ejemplo mientras se publica el tarifario real. <Link href="/legal/terminos">Términos</Link> · <Link href="/legal/creditos">Créditos de fotos</Link>
        </span>
      </div>
    </footer>
  );
}
