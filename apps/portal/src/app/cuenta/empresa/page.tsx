import { redirect } from 'next/navigation';
import { Yo } from '@sp/schemas';
import { PAISES, ZONAS } from '@/lib/paises';
import { api } from '@/lib/sesion';
import { guardarEmpresa } from '../../acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Empresa · Invermedia Radio', robots: { index: false } };

export default async function Empresa({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const q = await searchParams;
  const r = await api('/v1/cuentas/yo', { conSesion: true });
  if (r.status === 401) redirect('/ingresar?siguiente=/cuenta/empresa');
  const a = Yo.parse(r.datos).anunciante;
  const paises = PAISES.some(([c]) => c === a.pais) ? PAISES : [[a.pais, a.pais] as [string, string], ...PAISES];
  const zonas = ZONAS.some(([z]) => z === a.zonaHoraria) ? ZONAS : [[a.zonaHoraria, a.zonaHoraria] as [string, string], ...ZONAS];

  return (
    <>
      <h1>Empresa</h1>
      <p className="intro">Los datos con los que facturamos y te contactamos. Solo los ve el equipo de Invermedia.</p>
      {q.ok && <div className="aviso ok" role="status">Datos guardados.</div>}
      {q.error && <div className="aviso error" role="alert">{q.error}</div>}
      <form action={guardarEmpresa} className="tarjeta formulario">
        <div className="campo">
          <label htmlFor="empresa">Empresa o marca</label>
          <input id="empresa" name="empresa" autoComplete="organization" required maxLength={200} defaultValue={a.empresa} />
        </div>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="idFiscal">Identificación fiscal</label>
            <input id="idFiscal" name="idFiscal" maxLength={60} defaultValue={a.idFiscal ?? ''} placeholder="EIN, NIF, RUT, RIF…" />
          </div>
          <div className="campo">
            <label htmlFor="sector">Sector</label>
            <input id="sector" name="sector" maxLength={100} defaultValue={a.sector ?? ''} placeholder="Bebidas, turismo, tecnología…" />
          </div>
        </div>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="pais">País</label>
            <select id="pais" name="pais" required defaultValue={a.pais}>
              {paises.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="zonaHoraria">Tu zona horaria</label>
            <select id="zonaHoraria" name="zonaHoraria" required defaultValue={a.zonaHoraria}>
              {zonas.map(([z, n]) => (
                <option key={z} value={z}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="telefono">Teléfono</label>
            <input id="telefono" name="telefono" type="tel" autoComplete="tel" maxLength={40} defaultValue={a.telefono ?? ''} />
          </div>
          <div className="campo">
            <label htmlFor="sitioWeb">Sitio web</label>
            <input id="sitioWeb" name="sitioWeb" autoComplete="url" maxLength={200} defaultValue={a.sitioWeb ?? ''} placeholder="ejemplo.com" />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="direccion">Dirección fiscal</label>
          <input id="direccion" name="direccion" autoComplete="street-address" maxLength={300} defaultValue={a.direccion ?? ''} />
        </div>
        <div className="acciones">
          <button className="btn primary" type="submit">
            Guardar datos
          </button>
        </div>
      </form>
    </>
  );
}
