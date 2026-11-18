/**
 * Marcado estático del diseño (decoración y textos). Se inserta tal cual para conservar el diseño aprobado; los efectos
 * los arma `efectos.ts` en el navegador. Lo que toca datos reales (paquetes, cotizador, cuenta) está en componentes React.
 * No contiene nada que venga del usuario.
 */
export const ANTES_DE_VENTA = String.raw`  <section class="hero">
    <div class="wrap">
      <span class="onair"><i aria-hidden="true"></i><span id="liveNow">Al aire</span></span>
      <h1><span class="wd" style="--i:0">Tu</span> <span class="wd" style="--i:1">anuncio</span> <span class="wd" style="--i:2">en</span> <span class="tape">10&nbsp;radios</span> <span class="wd" style="--i:3">de</span> <span class="wd" style="--i:4">Venezuela.</span></h1>
      <p class="lead">Invermedia pone tu marca en diez emisoras, con un equipo que trabaja tu pauta en cada una. Eliges la hora, subes tu spot y pagas en línea desde cualquier país. Te enviamos la prueba de cada emisión.</p>
      <div class="ctas"><a class="btn primary" href="#cotizar">Cotizar mi pauta <span class="arrow">→</span></a><a class="btn" href="#paquetes">Ver paquetes</a></div>
    </div>
    <svg class="newsroom" id="newsroom" viewBox="0 0 1200 660" role="img" aria-label="Redacción de radio con diez agentes, cada uno en su emisora: Caracas, Valencia, Maracaibo, Barquisimeto, Mérida, San Cristóbal, El Vigía, Puerto Ordaz, Puerto La Cruz y Margarita"></svg>
  </section>

  <!-- PROGRAMAS -->
  <section>
    <div class="wrap"><div class="sec-head rv"><span class="label">Dónde suena tu anuncio</span><h2>Dentro de los programas que <span class="tape">ya escuchan</span></h2><p>Tu spot sale en la tanda comercial de la programación real del circuito. En cadena nacional o solo en las ciudades que elijas.</p></div></div>
    <div class="carousel" id="progs" aria-label="Programas del circuito"><div class="track" id="prow"></div></div>
    <div class="wrap carousel-hint"><span>Arrastra para explorar</span><span class="nav"><button data-c="progs" data-dir="1" aria-label="Anterior">←</button><button data-c="progs" data-dir="-1" aria-label="Siguiente">→</button></span></div>
  </section>

  <!-- MANIFIESTO -->
  <section class="statement band-m">
    <div class="wrap">
      <p id="manifest"><span class="w">Compramos</span> <span class="w">el</span> <span class="w hl">espacio</span><span class="ic" aria-hidden="true"><svg viewBox="0 0 20 14"><rect x="1" y="3" width="18" height="10" rx="3" fill="none" stroke="#2E123E" stroke-width="2"/><circle cx="14" cy="8" r="2.4" fill="#FE6B00"/></svg></span>, <span class="w">programamos</span> <span class="w">tu</span> <span class="w">spot</span> <span class="w">a</span> <span class="w">la</span> <span class="w hl">hora&nbsp;exacta</span><span class="ic k" aria-hidden="true"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="#FE6B00" stroke-width="2"/><path d="M8 4v4l3 2" fill="none" stroke="#FE6B00" stroke-width="2" stroke-linecap="round"/></svg></span>, <span class="w">una</span> <span class="w hl">persona</span> <span class="w">lo</span> <span class="w">revisa</span><span class="ic r" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span> <span class="w">y</span> <span class="w">te</span> <span class="w">enviamos</span> <span class="w">la</span> <span class="w hl">prueba</span> <span class="w">de</span> <span class="w">cada</span> <span class="w">emisión</span>. <span class="w">Tú</span> <span class="w">solo</span> <span class="w hl">apruebas.</span></p>
    </div>
  </section>

  <!-- CÓMO FUNCIONA -->
  <section id="como">
    <div class="wrap">
      <div class="sec-head rv"><span class="label">Cómo funciona</span><h2>Del archivo al aire en <span class="tape r">4 pasos</span></h2></div>
      <div class="steps" id="steps">
        <div class="rail" aria-hidden="true"><i></i></div>
        <div class="step" data-s="1"><span class="n">1</span>
          <div><h3>Elige las emisoras</h3><p>Toda la red o ciudad por ciudad: Caracas, Valencia, Maracaibo y seis más.</p></div>
          <div class="ui" aria-hidden="true"><div class="bar"><span class="t">Emisoras</span><span class="t" id="u1c">0 de 9</span></div><div class="chips" id="u1"></div></div></div>
        <div class="step" data-s="2"><span class="n">2</span>
          <div><h3>Marca las horas</h3><p>La programación real, hora por hora. Las franjas en rojo son programas en cadena: suenan en las diez emisoras a la vez.</p></div>
          <div class="ui" aria-hidden="true"><div class="bar"><span class="t">Lun – Dom · 06:00 a 12:00</span><span class="t" id="u2c">0 franjas</span></div><div class="mini" id="u2"></div></div></div>
        <div class="step" data-s="3"><span class="n">3</span>
          <div><h3>Sube y revisamos</h3><p>Tu comercial de 30 a 60 segundos. Una persona lo revisa según la normativa de CONATEL antes de programarlo.</p></div>
          <div class="ui" aria-hidden="true"><div class="bar"><span>spot_navidad_30s.mp3</span><span class="t">30 s</span></div><div class="wav" id="u3w"></div>
            <ul class="checks" id="u3"><li>Duración exacta<b>✓</b></li><li>Volumen sin saturar<b>✓</b></li><li>Normativa CONATEL · revisión humana<b>✓</b></li><li>Pago confirmado<b>✓</b></li></ul></div></div>
        <div class="step" data-s="4"><span class="n">4</span>
          <div><h3>Al aire y certificado</h3><p>Sigue cada emisión desde tu teléfono y descarga el certificado al cerrar la campaña.</p></div>
          <div class="ui" aria-hidden="true"><div class="bar"><span class="t">Certificado de transmisión</span><span class="ex">ejemplo</span></div><div class="bigcount" id="u4n">0</div><div class="certrows" id="u4"></div></div></div>
      </div>
    </div>
  </section>

  <!-- CÍRCULO DE EMISORAS -->
  <section class="ringsec band-w" id="emisoras">
    <div class="wrap ring-wrap">
      <div class="sec-head rv" style="margin:0"><span class="label">Cobertura</span><h2>Una compra. <span class="tape">Diez emisoras.</span></h2><p>Los programas en cadena nacional suenan en todo el circuito al mismo tiempo. Las franjas locales, solo donde las elijas. Arrastra el círculo para girarlo.</p>
        <div class="ctas" style="justify-content:flex-start"><a class="btn m" href="#paquetes">Ver paquetes <span class="arrow">→</span></a></div></div>
      <div class="wheel" id="wheel" aria-label="Las diez emisoras de Circuito Líder">
        <div class="orbit" id="orbit"></div>
        <div class="dial" aria-hidden="true"><div class="face"></div><div class="tk" id="ticks"></div><div class="needle"></div><div class="knob"></div><span class="cnt">10 emisoras FM</span></div>
      </div>
    </div>
  </section>`;
export const DESPUES_DE_VENTA = String.raw`  <!-- SUGERENCIAS -->
  <section>
    <div class="wrap">
      <div class="sec-head rv"><span class="label">Tu campaña te avisa</span><h2>Sugerencias que llegan <span class="tape">listas</span></h2><p>No tienes que estar pendiente. Cuando algo cambia, aparece con la acción preparada: apruebas o descartas con un toque.</p></div>
      <div class="board" id="board">
        <div class="sug" style="--i:0"><div class="top"><span class="tag"><i></i>Cupo disponible</span><span class="ex">ejemplo</span></div><p>ENCENDIDOS tiene espacio el lunes a las 06:40 en cadena nacional.</p><div class="acts"><button class="yes">Agregar a la pauta</button><button>Ahora no</button></div></div>
        <div class="sug" style="--i:1"><div class="top"><span class="tag"><i></i>Spot aprobado</span><span class="ex">ejemplo</span></div><p>“Navidad 30 s” pasó la revisión. ¿Lo programamos desde el 1 de diciembre?</p><div class="acts"><button class="yes">Programar</button><button>Cambiar fecha</button></div></div>
        <div class="sug" style="--i:2"><div class="top"><span class="tag"><i></i>Semana cerrada</span><span class="ex">ejemplo</span></div><p>Semana 1 completa: 42 de 42 emisiones salieron al aire.</p><div class="acts"><button class="yes">Ver reporte</button><button>Luego</button></div></div>
        <div class="sug" style="--i:3"><div class="top"><span class="tag"><i></i>Cobertura</span><span class="ex">ejemplo</span></div><p>Valencia y Maracaibo no están en tu pauta. ¿Sumamos las dos ciudades?</p><div class="acts"><button class="yes">Sumar ciudades</button><button>Ahora no</button></div></div>
      </div>
    </div>
  </section>

  <!-- COMPARACIÓN -->
  <section style="padding-top:20px">
    <div class="wrap">
      <div class="sec-head rv"><span class="label">Por qué aquí</span><h2>Comprar radio sin <span class="tape r">vueltas</span></h2></div>
      <div class="cmp" id="cmp">
        <div class="col them"><h3>Por tu cuenta</h3>
          <div class="it" style="transition-delay:0ms"><span class="mk">✕</span>Contactar emisora por emisora</div>
          <div class="it" style="transition-delay:90ms"><span class="mk">✕</span>Esperar la tarifa por correo</div>
          <div class="it" style="transition-delay:180ms"><span class="mk">✕</span>Enviar el audio y no saber si cumple</div>
          <div class="it" style="transition-delay:270ms"><span class="mk">✕</span>Transferir a cada emisora por separado</div>
          <div class="it" style="transition-delay:360ms"><span class="mk">✕</span>Confiar en que salió al aire</div></div>
        <div class="col us"><h3>Con Invermedia</h3>
          <div class="it" style="transition-delay:120ms"><span class="mk">✓</span>Diez emisoras en una sola compra</div>
          <div class="it" style="transition-delay:210ms"><span class="mk">✓</span>Precio al instante, mientras eliges</div>
          <div class="it" style="transition-delay:300ms"><span class="mk">✓</span>Una persona revisa tu spot y te dice qué cambiar</div>
          <div class="it" style="transition-delay:390ms"><span class="mk">✓</span>Un solo pago en línea</div>
          <div class="it" style="transition-delay:480ms"><span class="mk">✓</span>Certificado con cada emisión</div></div>
      </div>
    </div>
  </section>

  <!-- EMISIONES -->
  <section style="padding-top:20px">
    <div class="wrap"><div class="sec-head rv"><span class="label">Seguimiento</span><h2>Cada emisión, <span class="tape">a la vista</span></h2><p>Cada vez que tu spot suena, recibes un boleto. Arranca el talón para certificarlo. <span class="ex">ejemplo</span></p></div>
      <div class="ticket" id="ticket"><div class="tb"><span class="stamp">Certificado</span><span>BOLETO DE EMISIÓN · N.º 000184</span><b>ENCENDIDOS · 06:42</b><span>Líder 94.9 Caracas · spot de 30 s · cadena nacional</span><span>Martes 2 de diciembre</span></div><button class="ts" id="stub" aria-label="Arrancar el talón para certificar la emisión"><span><b>AL AIRE</b>Arrastra o toca para arrancar →</span></button><button class="reset" id="reset">Otro boleto</button></div>
    </div>
    <div class="tickets">
      <div class="carousel" id="tk1" aria-label="Emisiones recientes"><div class="track" id="tr1"></div></div>
      <div class="carousel" id="tk2" aria-hidden="true"><div class="track" id="tr2"></div></div>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq">
    <div class="wrap">
      <div class="sec-head rv"><span class="label">Preguntas</span><h2>Antes de comprar</h2></div>
      <details><summary>¿Puedo comprar desde fuera de Venezuela?</summary><p>Sí. La plataforma está pensada para anunciantes en el exterior. Los medios de pago y las monedas se confirman antes del lanzamiento.</p></details>
      <details><summary>¿Qué vendemos hoy?</summary><p>Comerciales grabados de 30 a 60 segundos en las diez emisoras de Circuito Líder. La mención en vivo del locutor y el patrocinio de programas llegan después.</p></details>
      <details><summary>¿Qué pasa si mi spot no cumple la normativa?</summary><p>Te avisamos con el motivo y lo que hay que cambiar antes de programarlo.</p></details>
      <details><summary>¿Cómo sé que salió al aire?</summary><p>Cada emisión aparece en tu panel y al final recibes un certificado con fecha, hora y emisora.</p></details>
      <details><summary>Prefiero que alguien me ayude.</summary><p>El equipo de ventas arma la pauta contigo por correo o WhatsApp.</p></details>
    </div>
  </section>

  <!-- CIERRE -->
  <section class="final">
    <div class="wrap rv"><span class="label">Tu primera campaña</span><h2>Aprueba hoy tu primera semana de radio.</h2><div class="ctas"><a class="btn ink" href="#cotizar">Cotizar mi pauta <span class="arrow">→</span></a><a class="btn" href="#faq">Hablar con ventas</a></div></div>
  </section>`;
export const TONO = String.raw`<!-- Toño: mascota y chat de soporte -->
<div class="sup" id="sup">
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
