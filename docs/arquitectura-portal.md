# Arquitectura del portal (`apps/portal`)

Cómo está armado el portal de anunciantes después del rediseño profesional del 2026-11-23. La dirección visual (por
qué se ve así) está en [diseno-portal.md](diseno-portal.md); esto explica dónde vive cada cosa y cómo crecer sin
que los archivos se vuelvan enormes.

## Regla de tamaño

Ningún archivo de código pasa de unas 200 líneas. Cuando un archivo crece, se parte por responsabilidad (un componente,
un hook, una ruta, un dominio) en una carpeta con `index.ts` que reexporta lo público. Las migraciones SQL ya aplicadas
no se parten: una migración aplicada no se edita nunca.

## Carpetas

```
src/
  middleware.ts          /cuenta/* sin cookie de sesión → /ingresar?siguiente=<ruta pedida>
  app/                   Rutas (App Router). Las páginas son componentes de servidor; los datos llegan de la API.
    layout.tsx           Marco: cabecera, pie, radio en vivo y la pauta compartida. Importa los estilos en orden.
    page.tsx             Portada: solo compone secciones (inicio/ y venta/).
    acciones.ts          Acciones de servidor (formularios): cotizar, registro, ingreso, reservar, subir anuncio…
    acciones-pagos.ts    Pagar en línea (lleva a la pasarela) y enviar el comprobante de transferencia.
    estilos/             CSS por pieza (ver abajo).
    cuenta/              Panel del anunciante (layout con menú, una carpeta por sección).
    emisoras/            Vitrina en vivo y ficha de cada emisora.
  componentes/
    inicio/              Secciones fijas de la portada: Heroe, ComoFunciona, Cobertura, Cierre, Tono.
    venta/               Lo que vende con datos reales: Buscador, Tienda (+TarjetaPrograma, TuPauta), Paquetes,
                         Cotizador (+ParrillaHoras, useSintonizador, useMantener), useCotizacion y datos.ts (puro).
    animacion/           Efectos decorativos: redacción de agentes, tablero «al aire», círculo de cobertura, Toño.
                         Todo pasa por control.ts para apagarse al salir de la página.
    Pauta.tsx            Contexto de la selección (la comparten cabecera, tienda, paquetes y cotizador).
    Radio.tsx            Reproductor en vivo que sigue sonando al navegar.
    Foto.tsx             next/image con fill, AVIF/WebP y `sizes`.
  lib/                   Utilidades sin React: api.ts (lecturas públicas), sesion.ts (cookie y llamadas con
                         sesión, server-only), cookie-sesion.ts (nombre de la cookie, también para el middleware),
                         fechas.ts, imagenes.ts (catálogo de fotos con crédito), marca.ts, vivo.ts.
test/                    Vitest de la lógica pura: fechas, vivo, venta (filtros, emisiones, paquetes), animacion.
```

## Flujo de la venta

1. `page.tsx` (servidor) lee emisoras, parrillas y tarifario de la API y arma `DatosVenta`.
2. `venta/datos.ts` (puro) convierte la parrilla en programas, filtra, calcula fechas y arma paquetes.
3. La selección vive en `PautaProvider` (`componentes/Pauta.tsx`); los lunes posibles los calcula el servidor en
   `layout.tsx` para que servidor y navegador no discrepen cerca de la medianoche.
4. `useCotizacion` calcula el precio en vivo con `@sp/pricing`; el precio que vale lo guarda la API al cotizar
   (`POST /v1/cotizaciones`, invariante P4). La acción `crearCotizacion` lleva a `/cotizacion/[id]`.

## Estilos

`app/estilos/` tiene un archivo por pieza, importados en `layout.tsx` en este orden:

| Archivo | Qué contiene |
|---|---|
| `tokens.css` | Colores de marca y tokens semánticos. Tema claro por defecto; `.oscura` (y cabecera, pie, radio, Toño) cambia a morado. `.clara.alterna` = fondo blanco. |
| `base.css` | Reinicio, tipografía, `.wrap`, `.seccion`, `.encabezado`, botones, chips, estados, avisos, movimiento reducido. |
| `marco.css` | Cabecera, pie, reproductor fijo, punto en vivo, espera de carga, `.foto`. |
| `heroe.css` | Héroe, cinta «10 radios», tablero, buscador, animaciones de la redacción. |
| `tienda.css` | Filtros, tarjetas de programa, «Tu pauta». |
| `secciones.css` | Cómo funciona, cobertura (círculo), paquetes, por qué, preguntas, cierre. |
| `cotizador.css` | Dial, emisoras, parrilla, total, odómetro, botón de mantener, chispas. |
| `tono.css` | Mascota y chat de soporte. |
| `cuenta.css` | Formularios, tablas, panel del anunciante, anuncios, certificados (también al imprimir). |
| `emisoras.css` | Vitrina y ficha de emisora. |

Los componentes usan solo tokens semánticos (`--fondo`, `--superficie`, `--texto`, `--texto-suave`, `--borde`,
`--acento-texto`). Para una sección nueva basta `className="seccion clara"` u `"seccion oscura"`: todo lo de dentro
se adapta. Sin degradados.

## Cómo agregar…

- **Una sección a la portada:** un componente en `componentes/inicio/` (o `venta/` si usa datos), exportado en su
  `index.ts`, y una línea en `app/page.tsx`. Sus estilos en `secciones.css` o, si pasa de ~60 líneas, en un archivo
  nuevo importado en `layout.tsx`.
- **Un efecto decorativo:** un módulo en `componentes/animacion/` que reciba el `Control` (temporizadores y eventos que
  se apagan solos) y una línea en `arranque.ts`. Debe respetar `c.reduce` (menos movimiento).
- **Una página del panel:** carpeta en `app/cuenta/`, entrada en `componentes/MenuCuenta.tsx`. El middleware ya la protege.

## Verificación

`pnpm --filter @sp/portal typecheck`, `pnpm --filter @sp/portal test` y la compilación
`NEXT_DIST_DIR=.next-ci pnpm --filter @sp/portal build` (después: `git checkout apps/portal/tsconfig.json`).
Capturas con Edge sin ventana y `--force-prefers-reduced-motion` para ver el estado final de las animaciones; el
ancho de teléfono (390 px) se revisa en el navegador del panel de Claude, porque Edge sin ventana no baja de ~500 px.
