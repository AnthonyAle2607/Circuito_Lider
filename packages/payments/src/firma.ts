import { createHmac, timingSafeEqual } from 'node:crypto';
import { AvisoInvalido } from './tipos';

/**
 * Firma de avisos al estilo de las pasarelas comunes: `t=<segundos>,v1=<hmac-sha256 de "t.cuerpo">`. Incluir la hora
 * impide reenviar un aviso viejo capturado; la comparación es de tiempo constante.
 */
export const TOLERANCIA_S = 300;

export function firmar(cuerpo: string, secreto: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

export function verificarFirma(cabecera: string | undefined, cuerpo: string, secreto: string, ahora = Math.floor(Date.now() / 1000)): void {
  if (!cabecera) throw new AvisoInvalido('falta la firma');
  const partes = Object.fromEntries(cabecera.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(partes.t);
  if (!Number.isInteger(t) || !partes.v1) throw new AvisoInvalido('firma mal formada');
  if (Math.abs(ahora - t) > TOLERANCIA_S) throw new AvisoInvalido('firma vencida');
  const esperada = Buffer.from(createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex'));
  const recibida = Buffer.from(partes.v1);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) throw new AvisoInvalido('firma incorrecta');
}
