import { todasLasImagenes } from '@/lib/imagenes';

export const metadata = { title: 'Créditos de fotos · Invermedia Radio', description: 'Autores y licencias de las fotos que usa el portal.' };

/** Quién hizo cada foto. Las de Unsplash no exigen atribución, pero se reconoce a sus autores igual. */
export default function Creditos() {
  const fotos = todasLasImagenes();
  return (
    <main className="pagina">
      <div className="wrap" style={{ maxWidth: 820 }}>
        <span className="label">Legal</span>
        <h1>Créditos de fotos</h1>
        <p className="intro">
          Las fotos de radio y de ciudades son de Unsplash, con su licencia de uso libre. Los logos de las emisoras y las artes de los programas son de
          Circuito Líder y se usarán con su autorización.
        </p>
        <div className="tarjeta">
          <table className="tabla">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Autor</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {fotos.map((f) => (
                <tr key={f.src}>
                  <td>{f.alt}</td>
                  <td>
                    <a href={f.credito.url} target="_blank" rel="noopener noreferrer">
                      {f.credito.autor}
                    </a>
                  </td>
                  <td>{f.credito.fuente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
