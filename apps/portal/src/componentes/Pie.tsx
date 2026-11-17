import Link from 'next/link';

export function Pie() {
  return (
    <footer>
      <div className="wrap">
        <span>INVERMEDIA · Radio en Circuito Líder</span>
        <span>
          Precios de ejemplo mientras se publica el tarifario real. <Link href="/legal/terminos">Términos</Link>
        </span>
      </div>
    </footer>
  );
}
