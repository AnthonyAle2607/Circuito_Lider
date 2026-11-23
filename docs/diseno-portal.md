# Dirección de diseño del portal (2026-11-23)

Contrato de diseño para el portal de anunciantes (`apps/portal`). Hecho con la skill `frontend-design-direction`. Cada
cambio visual debe poder justificarse con este documento.

## Para qué es y para quién

- **Trabajo del usuario:** un anunciante del exterior (gerente de marketing o agencia) quiere saber dónde puede sonar su
  marca, cuánto cuesta y reservarlo sin hablar con nadie.
- **Acción principal:** agregar programas a «Tu pauta» y cotizar/reservar.
- **Qué escanea primero:** cobertura (10 emisoras), precio «desde», horario, y la prueba de que la radio es real (se
  puede escuchar en vivo).

## Tono

**Media kit profesional con la marca Invermedia.** Sereno, confiable, legible. La personalidad de radio vive en tres
detalles (la redacción de agentes del héroe, el dial del cotizador que sintoniza y suena, y Toño), no en cada sección.

- **Detalle memorable:** el dial: frecuencias en Roboto Mono naranja, la radio sonando en vivo dentro del cotizador.
- **Marca que se conserva:** logo INVR/MDIA, morado `#2E123E`/`#3E1A52`, naranja `#FE6B00`, Oswald para títulos,
  Roboto para texto, Roboto Mono para datos. La cinta naranja inclinada queda solo en el titular del héroe («10 radios»).

## Reglas visuales

| Tema | Regla | Por qué |
|---|---|---|
| Color | Secciones alternadas: oscuras de marca (héroe, cobertura, cotizador, cierre) y claras (`--papel`, blanco) para comprar y leer. Naranja solo para acciones y datos clave. | El portal anterior era todo morado: cansaba y escondía las fotos. |
| Degradados | Ninguno. Colores planos. | Regla de Anthony. |
| Títulos | Oswald 600 en mayúsculas, tamaños moderados (`h2` 30–46 px). Sin cintas en los títulos de sección: el acento es una palabra en naranja. | Los títulos de 100 px y las cintas en cada sección se veían a «plantilla». |
| Fotos | A color, sin velos, con proporción fija y crédito en `/legal/creditos`. En tarjetas de emisoras, paquetes y la sección «Cómo funciona». Las tarjetas de programa no llevan foto genérica: esperan el arte de Circuito Líder. | Una foto tapada con color no informa nada. |
| Tarjetas | Blancas sobre fondo claro (borde `--linea`, radio 16 px, sin sombra), oscuras sobre fondo oscuro. Nunca una tarjeta dentro de otra. | Jerarquía limpia. |
| Movimiento | Solo donde da información: el dial que sintoniza, la radio en vivo, la redacción del héroe, el círculo de cobertura. Respeta `prefers-reduced-motion`. Los carruseles no se detienen con el cursor; Toño no sigue el cursor. | Reglas de Anthony. |

## Estados de contenido

| Estado | Dónde | Qué ve el usuario |
|---|---|---|
| Cargando | Cualquier página con datos | `loading.tsx`: onda animada «Sintonizando…», sin saltos. |
| Vacío | Tu pauta, Mis anuncios, Certificados, Campañas | Explica qué falta y ofrece la acción siguiente. |
| Error | Cualquier página | `error.tsx`: qué pasó y botón «Reintentar». Errores de formulario junto al formulario. |
| Parcial | Emisoras sin foto, emisora sin señal | Foto de respaldo; «Sin señal» en el reproductor sin romper la página. |
| Éxito | Agregar a la pauta, subir anuncio, reservar | Estado visible («✓ En tu pauta», «Recibido…», página del pedido). |
| Permiso | Panel sin sesión | Lleva a ingresar y vuelve a la página pedida. |

## Pantallas objetivo

Escritorio 1440 × 900 y teléfono 390 × 844. Sin desplazamiento horizontal; botones de al menos 44 px de alto en teléfono.

## Qué se quitó y por qué (rediseño del 2026-11-23)

| Pieza | Decisión |
|---|---|
| Velos de color sobre las fotos | Fuera. Las fotos van a color en Cómo funciona, paquetes y emisoras. |
| Cintas naranjas en cada título | Solo queda la del héroe («10 radios»). Las demás secciones usan una palabra de acento en naranja. |
| Fondo morado en todo el sitio | Ahora alterna: oscuro (héroe, cobertura, cotizador, cierre) y claro (tienda, cómo funciona, paquetes, por qué, preguntas, páginas internas). |
| Boleto que se arranca, botones con imán, carruseles y animaciones al hacer scroll | Fuera de la portada (y su código). Distraían de la compra. |
| Franja de fotos en el héroe | Pasó a «Cómo funciona», junto a los pasos. |

Se conservan: la redacción de agentes, el tablero «al aire», el dial del cotizador con la radio en vivo, el círculo de
cobertura que se arrastra y Toño en su esquina.

## Evidencia (2026-11-23)

- 1440 × 900: portada completa, `/emisoras`, `/emisoras/caracas`, `/ingresar`. Capturas con Edge sin ventana y
  movimiento reducido (estado final de las animaciones).
- 390 × 844: portada en el navegador del panel; el ancho de la página es igual al de la pantalla (sin desplazamiento
  horizontal). Buscador en columna, filtros que se envuelven, parrilla con desplazamiento propio.
- Funcional: «Agregar» suma el programa a «Tu pauta», el contador de la cabecera y el resumen del cotizador.
  `/cuenta/anuncios?x=1` sin sesión lleva a `/ingresar?siguiente=%2Fcuenta%2Fanuncios%3Fx%3D1`.
