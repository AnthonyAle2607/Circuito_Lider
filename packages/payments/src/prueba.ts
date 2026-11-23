import { randomBytes, randomUUID } from 'node:crypto';
import { firmar, verificarFirma } from './firma';
import { AvisoInvalido, type Aviso, type EstadoExterno, type Pasarela } from './tipos';

/**
 * Pasarela de PRUEBA: se comporta como una real (página de pago alojada, aviso firmado, consulta para conciliar) pero
 * no cobra. Sirve mientras Invermedia elige proveedor (pregunta abierta 1) y en las pruebas automáticas. Nunca en
 * producción: `config.ts` de la API lo impide.
 *
 * Las sesiones se guardan en un almacén clave-valor (Redis en la API y los trabajos, memoria en las pruebas) para que
 * la API y la conciliación vean lo mismo.
 */
export const CABECERA_FIRMA = 'x-pasarela-firma';

export interface Almacen {
  get(clave: string): Promise<string | null>;
  set(clave: string, valor: string): Promise<unknown>;
}

export interface SesionDePrueba {
  referencia: string;
  pagoId: string;
  montoCentimos: number;
  moneda: string;
  descripcion: string;
  urlExito: string;
  urlCancelar: string;
  venceAt: string;
  estado: EstadoExterno;
}

export function almacenEnMemoria(): Almacen {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => m.set(k, v) };
}

export interface PasarelaDePrueba extends Pasarela {
  leer(referencia: string): Promise<SesionDePrueba | null>;
  /**
   * Lo que haría el cliente en la página de pago: marca la sesión y devuelve el aviso firmado que la pasarela
   * enviaría (cuerpo + cabecera), para entregarlo al endpoint de avisos.
   */
  resolver(referencia: string, resultado: 'aprobado' | 'rechazado'): Promise<{ cuerpo: string; firma: string; sesion: SesionDePrueba }>;
}

export function pasarelaDePrueba(op: { secreto: string; urlPagina: (referencia: string) => string; almacen: Almacen }): PasarelaDePrueba {
  if (op.secreto.length < 32) throw new Error('El secreto de la pasarela de prueba debe tener al menos 32 caracteres');
  const clave = (r: string) => `pasarela-prueba:${r}`;
  const leer = async (r: string): Promise<SesionDePrueba | null> => {
    const v = await op.almacen.get(clave(r));
    if (!v) return null;
    const s = JSON.parse(v) as SesionDePrueba;
    // Una sesión sin pagar a la que se le pasó la hora queda expirada, como en una pasarela real.
    if (s.estado === 'pendiente' && new Date(s.venceAt) < new Date()) s.estado = 'expirado';
    return s;
  };
  const guardar = (s: SesionDePrueba) => op.almacen.set(clave(s.referencia), JSON.stringify(s));

  return {
    nombre: 'prueba',
    leer,
    async crearSesion(p) {
      const referencia = `ps_${randomBytes(12).toString('hex')}`;
      const s: SesionDePrueba = { referencia, ...p, venceAt: p.venceAt.toISOString(), estado: 'pendiente' };
      await guardar(s);
      return { referencia, url: op.urlPagina(referencia), venceAt: p.venceAt };
    },
    async resolver(referencia, resultado) {
      const s = await leer(referencia);
      if (!s) throw new Error('sesión de prueba inexistente');
      if (s.estado !== 'pendiente') throw new Error(`la sesión ya está ${s.estado}`);
      s.estado = resultado;
      await guardar(s);
      const cuerpo = JSON.stringify({
        id: `evt_${randomUUID()}`,
        tipo: resultado === 'aprobado' ? 'pago.aprobado' : 'pago.rechazado',
        datos: { referencia, estado: resultado, monto: s.montoCentimos, moneda: s.moneda, pago_id: s.pagoId },
      });
      return { cuerpo, firma: firmar(cuerpo, op.secreto), sesion: s };
    },
    verificarAviso(cabeceras, cuerpoCrudo): Aviso {
      const f = cabeceras[CABECERA_FIRMA];
      verificarFirma(Array.isArray(f) ? f[0] : f, cuerpoCrudo, op.secreto);
      let d: { id?: unknown; tipo?: unknown; datos?: Record<string, unknown> };
      try {
        d = JSON.parse(cuerpoCrudo);
      } catch {
        throw new AvisoInvalido('cuerpo ilegible');
      }
      const x = d.datos ?? {};
      const estados: EstadoExterno[] = ['pendiente', 'aprobado', 'rechazado', 'expirado'];
      if (typeof d.id !== 'string' || typeof x.referencia !== 'string' || !estados.includes(x.estado as EstadoExterno) || !Number.isInteger(x.monto)) {
        throw new AvisoInvalido('aviso incompleto');
      }
      return { eventoId: d.id, tipo: String(d.tipo), referencia: x.referencia, estado: x.estado as EstadoExterno, montoCentimos: x.monto as number, moneda: String(x.moneda) };
    },
    async consultar(referencia) {
      const s = await leer(referencia);
      if (!s) return { estado: 'expirado', montoCentimos: 0, moneda: '' };
      return { estado: s.estado, montoCentimos: s.montoCentimos, moneda: s.moneda };
    },
  };
}
