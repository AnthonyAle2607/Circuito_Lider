import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token opaco de 256 bits en base64url (43 caracteres). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Lo que se guarda en la base: nunca el token en claro. */
export function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** AES-256-GCM. Formato: iv(12) | tag(16) | texto cifrado. `aad` ata el secreto a su dueño. */
export function encryptSecret(key: Buffer, plain: Buffer, aad: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSecret(key: Buffer, blob: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}
