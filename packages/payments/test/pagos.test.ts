import { describe, expect, it } from 'vitest';
import { AvisoInvalido, CABECERA_FIRMA, almacenEnMemoria, firmar, pasarelaDePrueba, verificarFirma } from '../src';

const SECRETO = 'secreto-de-prueba-con-al-menos-32-caracteres';

describe('firma de avisos', () => {
  it('acepta la firma correcta', () => {
    expect(() => verificarFirma(firmar('{"a":1}', SECRETO), '{"a":1}', SECRETO)).not.toThrow();
  });

  it('rechaza un cuerpo alterado, otro secreto o una firma vieja', () => {
    const f = firmar('{"monto":100}', SECRETO);
    expect(() => verificarFirma(f, '{"monto":1}', SECRETO)).toThrow(AvisoInvalido);
    expect(() => verificarFirma(f, '{"monto":100}', 'otro-secreto-de-al-menos-32-caracteres!!')).toThrow(AvisoInvalido);
    const vieja = firmar('{}', SECRETO, Math.floor(Date.now() / 1000) - 3600);
    expect(() => verificarFirma(vieja, '{}', SECRETO)).toThrow('vencida');
    expect(() => verificarFirma(undefined, '{}', SECRETO)).toThrow('falta');
    expect(() => verificarFirma('basura', '{}', SECRETO)).toThrow(AvisoInvalido);
  });
});

describe('pasarela de prueba', () => {
  const nueva = () => pasarelaDePrueba({ secreto: SECRETO, urlPagina: (r) => `https://api.prueba/pagar/${r}`, almacen: almacenEnMemoria() });
  const pedir = { pagoId: 'p1', montoCentimos: 31350, moneda: 'USD', descripcion: 'Pedido', urlExito: 'https://ok', urlCancelar: 'https://no' };

  it('crea una sesión alojada y avisa el pago con un mensaje firmado que se puede verificar', async () => {
    const p = nueva();
    const s = await p.crearSesion({ ...pedir, venceAt: new Date(Date.now() + 60_000) });
    expect(s.url).toBe(`https://api.prueba/pagar/${s.referencia}`);
    expect((await p.consultar(s.referencia)).estado).toBe('pendiente');

    const { cuerpo, firma } = await p.resolver(s.referencia, 'aprobado');
    const aviso = p.verificarAviso({ [CABECERA_FIRMA]: firma }, cuerpo);
    expect(aviso).toMatchObject({ referencia: s.referencia, estado: 'aprobado', montoCentimos: 31350, moneda: 'USD' });
    expect(await p.consultar(s.referencia)).toMatchObject({ estado: 'aprobado', montoCentimos: 31350 });
    await expect(p.resolver(s.referencia, 'rechazado')).rejects.toThrow('ya está aprobado');
  });

  it('una sesión sin pagar vence sola', async () => {
    const p = nueva();
    const s = await p.crearSesion({ ...pedir, venceAt: new Date(Date.now() - 1000) });
    expect((await p.consultar(s.referencia)).estado).toBe('expirado');
    expect((await p.consultar('no-existe')).estado).toBe('expirado');
  });

  it('no acepta avisos sin firma válida', async () => {
    const p = nueva();
    const s = await p.crearSesion({ ...pedir, venceAt: new Date(Date.now() + 60_000) });
    const { cuerpo } = await p.resolver(s.referencia, 'aprobado');
    expect(() => p.verificarAviso({}, cuerpo)).toThrow(AvisoInvalido);
    expect(() => p.verificarAviso({ [CABECERA_FIRMA]: firmar(cuerpo, SECRETO) }, cuerpo.replace('31350', '1'))).toThrow(AvisoInvalido);
  });
});
