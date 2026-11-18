/**
 * Password hashing with scrypt (Node/Bun built-in).
 *
 * scrypt is deliberately slow and memory-hard, which makes brute-force attacks
 * on a stolen hash expensive. A random salt prevents identical passwords from
 * producing identical hashes.
 *
 * Format: scrypt:N:r:p:saltBase64:hashBase64
 *
 * Colons are used instead of the more common "$" separator because the hash is
 * stored in a .env file, where "$" can be interpreted as variable expansion.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 32_768; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelisation
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 128 * N * R * 2; // scrypt needs slightly more than 128*N*r

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEMORY,
  });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join(":");
}

/**
 * Verify a password against a stored hash.
 * Uses a constant-time comparison to avoid leaking information through timing.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n <= 1 ||
    r <= 0 ||
    p <= 0 ||
    !saltRaw ||
    !hashRaw
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltRaw, "base64");
    const expected = Buffer.from(hashRaw, "base64");
    if (expected.length === 0) return false;

    const actual = scryptSync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 128 * n * r * 2,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
