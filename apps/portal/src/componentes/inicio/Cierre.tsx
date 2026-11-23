const RAZONES = [
  { titulo: 'Revisamos tu anuncio', texto: 'Duración y contenido antes de que salga al aire. Si algo no cumple, te decimos qué cambiar.' },
  { titulo: 'Un solo pago en línea', texto: 'Diez emisoras en una compra. El precio queda cerrado al reservar y los espacios quedan apartados mientras pagas.' },
  { titulo: 'Prueba de cada emisión', texto: 'Cada vez que tu spot suena queda registrado con su hora y su audio. Al cerrar la campaña recibes el certificado.' },
];

const PREGUNTAS = [
  ['¿Puedo comprar desde fuera de Venezuela?', 'Sí. La plataforma está pensada para anunciantes en el exterior. Los medios de pago y las monedas se confirman antes del lanzamiento.'],
  ['¿Qué vendemos hoy?', 'Comerciales grabados de 30 o 40 segundos en las diez emisoras de Circuito Líder. La mención en vivo del locutor y el patrocinio de programas llegan después.'],
  ['¿Qué pasa si mi spot no cumple la normativa?', 'Te avisamos con el motivo y lo que hay que cambiar antes de programarlo.'],
  ['¿Cómo sé que salió al aire?', 'Cada emisión aparece en tu panel y al final recibes un certificado con fecha, hora y emisora.'],
  ['Prefiero que alguien me ayude.', 'El equipo de ventas arma la pauta contigo por correo o WhatsApp.'],
] as const;

/** Por qué aquí, preguntas frecuentes y la llamada final. */
export function Cierre() {
  return (
    <>
      <section id="porque" className="seccion clara alterna">
        <div className="wrap">
          <header className="encabezado">
            <span className="sobretitulo">Por qué aquí</span>
            <h2>
              Comprar radio <em>sin vueltas</em>
            </h2>
          </header>
          <div className="razones">
            {RAZONES.map((r, i) => (
              <article key={r.titulo} className="razon">
                <span className="n">0{i + 1}</span>
                <h3>{r.titulo}</h3>
                <p>{r.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="seccion clara">
        <div className="wrap faq">
          <header className="encabezado">
            <span className="sobretitulo">Preguntas</span>
            <h2>Antes de comprar</h2>
          </header>
          <div>
            {PREGUNTAS.map(([p, r]) => (
              <details key={p}>
                <summary>{p}</summary>
                <p>{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="seccion oscura final">
        <div className="wrap">
          <span className="sobretitulo">Tu primera campaña</span>
          <h2>
            Aprueba hoy tu primera <em>semana de radio</em>
          </h2>
          <div className="ctas">
            <a className="btn primary" href="#espacios">
              Ver espacios <span className="arrow">→</span>
            </a>
            <a className="btn" href="#faq">
              Hablar con ventas
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
