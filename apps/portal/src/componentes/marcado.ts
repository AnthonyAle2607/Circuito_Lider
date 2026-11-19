/**
 * Marcado estático del diseño (decoración y textos). Se inserta tal cual para conservar el diseño aprobado; los efectos
 * los arma `efectos-diseno.ts` en el navegador. Lo que toca datos reales (buscador, tienda, paquetes, cotizador) está
 * en componentes React. No contiene nada que venga del usuario.
 *
 * Rediseño 2026-11-19 (opción B unida al portal): el héroe se parte en dos para meter el buscador entre el texto y la
 * redacción de agentes; «Cómo funciona» queda en una fila; sugerencias, comparación y boleto se unen en una sección.
 */
export const HERO_TEXTO = String.raw`      <span class="onair"><i aria-hidden="true"></i><span id="liveNow">Al aire</span></span>
      <h1><span class="wd" style="--i:0">Tu</span> <span class="wd" style="--i:1">anuncio</span> <span class="wd" style="--i:2">en</span> <span class="tape">10&nbsp;radios</span> <span class="wd" style="--i:3">de</span> <span class="wd" style="--i:4">Venezuela.</span></h1>
      <p class="lead">Invermedia pone tu marca en diez emisoras, con un equipo que trabaja tu pauta en cada una. Eliges la hora, subes tu spot y pagas en línea desde cualquier país. Te enviamos la prueba de cada emisión.</p>`;
export const HERO_REDACCION = String.raw`<svg class="newsroom" id="newsroom" viewBox="0 0 1200 660" role="img" aria-label="Redacción de radio con diez agentes, cada uno en su emisora: Caracas, Valencia, Maracaibo, Barquisimeto, Mérida, San Cristóbal, El Vigía, Puerto Ordaz, Puerto La Cruz y Margarita"></svg>`;
export const MEDIO = String.raw`  <!-- CÓMO FUNCIONA -->
  <section id="como" class="como-fila">
    <div class="wrap">
      <div class="sec-head rv"><span class="label">Cómo funciona</span><h2>Del archivo al aire en <span class="tape r">4 pasos</span></h2></div>
      <ol class="pasos">
        <li class="rv"><span class="n">1</span><h3>Elige</h3><p>Programas y emisoras, en cadena o ciudad por ciudad, con el precio a la vista.</p></li>
        <li class="rv"><span class="n">2</span><h3>Sube tu anuncio</h3><p>MP3, WAV o MP4 de 30 o 40 segundos. Una persona lo revisa según la normativa de CONATEL.</p></li>
        <li class="rv"><span class="n">3</span><h3>Paga en línea</h3><p>Un solo pago para las diez emisoras, desde cualquier país.</p></li>
        <li class="rv"><span class="n">4</span><h3>Al aire y certificado</h3><p>Cada emisión con su hora, su emisora y el audio grabado de ese momento.</p></li>
      </ol>
    </div>
  </section>

  <!-- CÍRCULO DE EMISORAS -->
  <section class="ringsec band-w" id="emisoras">
    <div class="wrap ring-wrap">
      <div class="sec-head rv" style="margin:0"><span class="label">Cobertura</span><h2>Una compra. <span class="tape">Diez emisoras.</span></h2><p>Los programas en cadena nacional suenan en todo el circuito al mismo tiempo. Las franjas locales, solo donde las elijas. Arrastra el círculo para girarlo.</p>
        <div class="ctas" style="justify-content:flex-start"><a class="btn m" href="#paquetes">Ver paquetes <span class="arrow">→</span></a><a class="btn" href="/emisoras">Escuchar en vivo</a></div></div>
      <div class="wheel" id="wheel" aria-label="Las diez emisoras de Circuito Líder">
        <div class="orbit" id="orbit"></div>
        <div class="dial" aria-hidden="true"><div class="face"></div><div class="tk" id="ticks"></div><div class="needle"></div><div class="knob"></div><span class="cnt">10 emisoras FM</span></div>
      </div>
    </div>
  </section>`;
export const FINAL = String.raw`  <!-- POR QUÉ AQUÍ: une sugerencias, comparación y boleto -->
  <section id="porque">
    <div class="wrap">
      <div class="sec-head rv"><span class="label">Por qué aquí</span><h2>Comprar radio sin <span class="tape r">vueltas</span></h2></div>
      <div class="porque">
        <div class="porque-item rv"><h3>Revisamos tu anuncio</h3><p>Duración y contenido antes de que salga al aire. Si algo no cumple, te decimos qué cambiar.</p></div>
        <div class="porque-item rv"><h3>Un solo pago en línea</h3><p>Diez emisoras en una compra. El precio queda cerrado al reservar y los espacios quedan apartados mientras pagas.</p></div>
        <div class="porque-item rv"><h3>Tu campaña te avisa</h3><p>Cupos que se liberan, spot aprobado, semana cerrada: te llega con la acción lista para aprobar con un toque.</p></div>
      </div>
      <p class="porque-boleto rv">Cada vez que tu spot suena, recibes un boleto. Arranca el talón para certificarlo. <span class="ex">ejemplo</span></p>
      <div class="ticket" id="ticket"><div class="tb"><span class="stamp">Certificado</span><span>BOLETO DE EMISIÓN · N.º 000184</span><b>ENCENDIDOS · 06:42</b><span>Líder 94.9 Caracas · spot de 30 s · cadena nacional</span><span>Martes 2 de diciembre</span></div><button class="ts" id="stub" aria-label="Arrancar el talón para certificar la emisión"><span><b>AL AIRE</b>Arrastra o toca para arrancar →</span></button><button class="reset" id="reset">Otro boleto</button></div>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq">
    <div class="wrap">
      <div class="sec-head rv"><span class="label">Preguntas</span><h2>Antes de comprar</h2></div>
      <details><summary>¿Puedo comprar desde fuera de Venezuela?</summary><p>Sí. La plataforma está pensada para anunciantes en el exterior. Los medios de pago y las monedas se confirman antes del lanzamiento.</p></details>
      <details><summary>¿Qué vendemos hoy?</summary><p>Comerciales grabados de 30 o 40 segundos en las diez emisoras de Circuito Líder. La mención en vivo del locutor y el patrocinio de programas llegan después.</p></details>
      <details><summary>¿Qué pasa si mi spot no cumple la normativa?</summary><p>Te avisamos con el motivo y lo que hay que cambiar antes de programarlo.</p></details>
      <details><summary>¿Cómo sé que salió al aire?</summary><p>Cada emisión aparece en tu panel y al final recibes un certificado con fecha, hora y emisora.</p></details>
      <details><summary>Prefiero que alguien me ayude.</summary><p>El equipo de ventas arma la pauta contigo por correo o WhatsApp.</p></details>
    </div>
  </section>

  <!-- CIERRE -->
  <section class="final">
    <div class="wrap rv"><span class="label">Tu primera campaña</span><h2>Aprueba hoy tu primera semana de radio.</h2><div class="ctas"><a class="btn ink" href="#espacios">Ver espacios <span class="arrow">→</span></a><a class="btn" href="#faq">Hablar con ventas</a></div></div>
  </section>`;
export const TONO = String.raw`<div class="sup" id="sup">
  <div class="panel" id="panel" role="dialog" aria-label="Chat de soporte con Toño" hidden>
    <div class="ph"><span class="mini" id="tonoMini" aria-hidden="true"></span><div><b>Toño</b><span id="tst">Soporte Invermedia · en línea</span></div><button class="x" id="tclose" aria-label="Cerrar el chat">×</button></div>
    <div class="pm" id="pm" aria-live="polite"></div>
    <div class="pq" id="pq"></div>
    <form class="pf" id="pf"><input id="pin" autocomplete="off" placeholder="Escríbele a Toño…" aria-label="Tu mensaje"><button aria-label="Enviar">➤</button></form>
    <div class="pnote">Respuestas automáticas · pronto con el agente de ventas</div>
  </div>
  <div class="teaser" id="teaser">¿Te ayudo con tu pauta? 📻</div>
  <button class="sup-btn" id="supBtn" aria-expanded="false" aria-controls="panel" aria-label="Abrir el chat de soporte con Toño"><span class="dot" aria-hidden="true"></span></button>
</div>`;
