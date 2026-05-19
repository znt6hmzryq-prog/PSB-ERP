/**
 * Password hashing using Node.js crypto (scrypt)
 * No external dependencies required.
 */

import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(plain, salt, KEY_LENGTH);
  const original = Buffer.from(hash, "hex");
  if (computed.length !== original.length) return false;
  return timingSafeEqual(computed, original);
}
