# @sp/sales-agent

El agente vendedor (Toño) con Claude Opus 5.5: instrucciones versionadas, herramientas con límites en código, el bucle
de un turno en streaming (`atender`), el cálculo de gasto y `config/agente.yaml`. No conoce la base: la API le pasa un
`Dominio` hecho con sus propias funciones. `test/simulador.ts` simula la API de Claude (flujos SSE) para probar sin red.

Todo el diseño: [docs/agente-vendedor.md](../../docs/agente-vendedor.md). Banco de pruebas: `evals/` (cuesta dinero).
