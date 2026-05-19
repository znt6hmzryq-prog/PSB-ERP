import { scryptSync, randomBytes } from "node:crypto";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

console.log(hashPassword("Admin@123"));