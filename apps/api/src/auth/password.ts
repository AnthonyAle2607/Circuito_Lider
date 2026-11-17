import { hash, verify } from '@node-rs/argon2';

// Argon2id (algoritmo por defecto de la librería) con los mínimos de OWASP: 19 MiB, 2 pasadas.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/** Nunca lanza: un hash corrupto o una clave inválida son simplemente «no coincide». */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/**
 * Cuando el correo no existe se verifica igual contra un hash falso, para que responder
 * «no existe» no tarde menos que responder «clave incorrecta» (enumeración por tiempo).
 */
export function verifyAgainstDummy(plain: string): Promise<boolean> {
  dummy ??= hashPassword('no-es-una-clave-real');
  return dummy.then((h) => verifyPassword(h, plain));
}

/** Política para claves NUEVAS (la entrada de login solo limita el máximo). */
export function passwordPolicyError(plain: string): string | null {
  if (plain.length < 12) return 'La clave debe tener al menos 12 caracteres.';
  if (plain.length > 128) return 'La clave no puede pasar de 128 caracteres.';
  if (new Set(plain).size < 5) return 'La clave es demasiado repetitiva.';
  return null;
}
