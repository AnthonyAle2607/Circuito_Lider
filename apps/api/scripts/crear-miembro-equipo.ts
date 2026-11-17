/**
 * Da de alta a una persona del equipo de Invermedia con su clave y su doble factor.
 *
 *   pnpm --filter @sp/api crear-miembro-equipo --email ana@invermedia.com --nombre "Ana" --roles ventas,gerencia
 *
 * Usa DATABASE_URL_MIGRATOR (la aplicación no puede crear miembros) y MFA_KEY. Imprime UNA sola vez la clave inicial y
 * el enlace otpauth:// para la aplicación de autenticación; no se guardan en ningún otro lado. Pásalos por un canal seguro.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { RolEquipo } from '@sp/schemas';
import { createDb } from '@sp/db';
import { registrar } from '@sp/audit';
import { encryptSecret } from '../src/auth/crypto';
import { hashPassword } from '../src/auth/password';
import { newTotpSecret, otpauthUri } from '../src/auth/totp';

const { values } = parseArgs({
  options: { email: { type: 'string' }, nombre: { type: 'string' }, roles: { type: 'string' } },
});
const url = process.env.DATABASE_URL_MIGRATOR;
const llave = process.env.MFA_KEY ? Buffer.from(process.env.MFA_KEY, 'base64') : undefined;
if (!values.email || !values.nombre || !values.roles) {
  console.error('Uso: crear-miembro-equipo --email <correo> --nombre "<nombre>" --roles ventas,revisor,...');
  process.exit(2);
}
if (!url || !llave || llave.length !== 32) {
  console.error('Faltan DATABASE_URL_MIGRATOR o MFA_KEY (32 bytes en base64) en el entorno.');
  process.exit(2);
}
const roles = values.roles.split(',').map((r) => RolEquipo.parse(r.trim()));

const id = randomUUID();
const clave = randomBytes(18).toString('base64url');
const secreto = newTotpSecret();
const db = createDb(url, 1);
try {
  await db.transaction().execute(async (t) => {
    await t
      .insertInto('equipo')
      .values({
        id,
        email: values.email!.trim().toLowerCase(),
        nombre: values.nombre!.trim(),
        password_hash: await hashPassword(clave),
        roles,
        totp_secreto_cifrado: encryptSecret(llave, secreto, id),
      })
      .execute();
    await registrar(t, {
      actor: { tipo: 'sistema', nombre: 'crear-miembro-equipo' },
      accion: 'equipo.alta',
      entidad: 'equipo',
      entidadId: id,
      datos: { roles },
    });
  });
  console.log(`\nAlta lista: ${values.nombre} <${values.email}> · roles: ${roles.join(', ')}`);
  console.log(`Clave inicial (se muestra solo ahora): ${clave}`);
  console.log(`Doble factor: añade este enlace (o su QR) en la aplicación de autenticación:\n${otpauthUri(secreto, values.email, 'Sistema de Pautas')}\n`);
} finally {
  await db.destroy();
}
