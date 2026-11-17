import { createHmac, randomBytes } from 'node:crypto';

// TOTP según RFC 6238 (HMAC-SHA1, 6 dígitos, 30 s): compatible con Google Authenticator, Authy, 1Password…
const STEP = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin =
    ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Devuelve el contador (paso de 30 s) que coincide con el código, o null. Acepta ±1 paso por
 * desfase de reloj. El contador sirve para impedir reutilizar el mismo código (replay).
 */
export function verifyTotp(secret: Buffer, code: string, nowMs = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(nowMs / 1000 / STEP);
  let found: number | null = null;
  // Se recorren todas las ventanas sin cortar antes: el tiempo no depende de cuál acierta.
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, current + w);
    let diff = 0;
    for (let i = 0; i < DIGITS; i++) diff |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0) found = current + w;
  }
  return found;
}

export function otpauthUri(secret: Buffer, email: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}
