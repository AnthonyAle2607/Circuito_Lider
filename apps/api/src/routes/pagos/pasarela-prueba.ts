import type { FastifyInstance } from 'fastify';
import { CABECERA_FIRMA, type PasarelaDePrueba } from '@sp/payments';
import { HttpError } from '../../plugins/errores';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dinero = (c: number, m: string) => `${m} ${(c / 100).toLocaleString('es-VE', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;

function pagina(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;font:16px/1.5 system-ui,sans-serif;background:#f6f3f8;color:#1e0e29;display:grid;place-items:center;min-height:100vh;padding:16px">
<main style="background:#fff;border:1px solid #e2d9e9;border-radius:16px;padding:28px;max-width:420px;width:100%">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#9a3d00">Pasarela de prueba · no cobra</p>${cuerpo}</main></body></html>`;
}

/**
 * La página «alojada» de la pasarela de prueba, para probar el flujo completo en desarrollo sin un proveedor real.
 * Al pagar o rechazar hace lo que haría la pasarela: entrega el aviso firmado al endpoint de avisos (de servidor a
 * servidor) y devuelve al cliente al portal. Solo se monta con PAGOS_PROVEEDOR=prueba.
 */
export async function rutaPasarelaPrueba(app: FastifyInstance, pasarela: PasarelaDePrueba, portalUrl: string): Promise<void> {
  // La política general (helmet) dice `form-action 'self'`, y el navegador la aplica también a la redirección que sigue
  // al formulario: sin esto, el pago se registra pero el cliente no vuelve al portal. Esta página solo puede enviar
  // el formulario a sí misma y volver al portal; no carga nada más.
  const politica = `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(portalUrl).origin}; base-uri 'none'; frame-ancestors 'none'`;
  await app.register(async (sub) => {
    sub.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, cuerpo, listo) =>
      listo(null, Object.fromEntries(new URLSearchParams(String(cuerpo)))),
    );

    sub.get<{ Params: { ref: string } }>('/v1/pasarela-prueba/:ref', async (req, reply) => {
      const s = await pasarela.leer(req.params.ref);
      if (!s) throw new HttpError(404, 'sesion_no_existe', 'Esta sesión de pago no existe.');
      const cuerpo =
        s.estado !== 'pendiente'
          ? `<h1 style="margin:0 0 12px;font-size:22px">Sesión ${esc(s.estado)}</h1><a href="${esc(s.urlCancelar)}">Volver al portal</a>`
          : `<h1 style="margin:0 0 4px;font-size:22px">${esc(s.descripcion)}</h1>
<p style="margin:0 0 20px;font-size:32px;font-weight:700">${esc(dinero(s.montoCentimos, s.moneda))}</p>
<form method="post" style="display:grid;gap:10px">
<button name="resultado" value="aprobado" style="padding:14px;border:0;border-radius:10px;background:#fe6b00;color:#2e123e;font-weight:700;font-size:16px;cursor:pointer">Pagar (prueba)</button>
<button name="resultado" value="rechazado" style="padding:14px;border:1px solid #c9bad6;border-radius:10px;background:#fff;font-size:16px;cursor:pointer">Simular tarjeta rechazada</button>
</form><p style="margin:16px 0 0"><a href="${esc(s.urlCancelar)}">Volver sin pagar</a></p>`;
      return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').header('content-security-policy', politica).send(pagina('Pagar · prueba', cuerpo));
    });

    sub.post<{ Params: { ref: string }; Body: { resultado?: string } }>('/v1/pasarela-prueba/:ref', async (req, reply) => {
      const resultado = req.body?.resultado;
      if (resultado !== 'aprobado' && resultado !== 'rechazado') throw new HttpError(400, 'resultado', 'Elige pagar o rechazar.');
      const s = await pasarela.leer(req.params.ref);
      if (!s || s.estado !== 'pendiente') throw new HttpError(409, 'sesion_cerrada', 'Esta sesión de pago ya no está abierta.');
      const { cuerpo, firma } = await pasarela.resolver(req.params.ref, resultado);
      // Entrega del aviso «desde la pasarela»: la misma ruta pública que usaría un proveedor real.
      const r = await app.inject({ method: 'POST', url: `/v1/pagos/webhook/${pasarela.nombre}`, payload: cuerpo, headers: { 'content-type': 'application/json', [CABECERA_FIRMA]: firma } });
      if (r.statusCode !== 200) req.log.error({ estado: r.statusCode, cuerpo: r.body }, 'la pasarela de prueba no pudo entregar el aviso');
      return reply.redirect(resultado === 'aprobado' ? s.urlExito : s.urlCancelar, 303);
    });
  });
}
