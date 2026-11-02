import { readFileSync, writeFileSync } from "node:fs";

/**
 * The fake owner. It exists only in the local stack, so it couldn't sign in to
 * hosted. Its TOTP secret changes with every seed and stays out of git.
 */
export const OWNER_EMAIL = "owner@sandbox.invalid";
export const OWNER_PASSWORD = "sandbox-only-password";

const SECRET_FILE = "sandbox/.owner-totp";

export function saveTotpSecret(secret: string): void {
  writeFileSync(SECRET_FILE, secret);
}

export function readTotpSecret(): string {
  return readFileSync(SECRET_FILE, "utf8");
}
