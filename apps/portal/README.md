# Portal de anunciantes (`@sp/portal`)

Web pública donde un anunciante del exterior elige programas de Circuito Líder, cotiza, reserva y sigue su campaña.
Next.js 15 (App Router), puerto 3100. Habla con la API (`API_URL`, por defecto `http://127.0.0.1:4100`) siempre desde
el servidor; el token vive en la cookie HttpOnly `sp_sesion`.

| Qué | Comando |
|---|---|
| Desarrollo | `pnpm --filter @sp/portal dev` (o `pnpm iniciar` en la raíz) |
| Tipos | `pnpm --filter @sp/portal typecheck` |
| Pruebas | `pnpm --filter @sp/portal test` |
| Compilar sin pisar el dev | `NEXT_DIST_DIR=.next-ci pnpm --filter @sp/portal build` y luego `git checkout apps/portal/tsconfig.json` |

- Estructura y cómo agregar piezas: [docs/arquitectura-portal.md](../../docs/arquitectura-portal.md).
- Dirección visual y reglas de diseño: [docs/diseno-portal.md](../../docs/diseno-portal.md).
- Fotos y créditos: `src/lib/imagenes.ts` y `/legal/creditos`.
