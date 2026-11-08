import { readFileSync, writeFileSync } from "node:fs";

/**
 * The sandbox's made-up users. They exist only in the local stack, so they
 * couldn't sign in to hosted. Each TOTP secret changes with every seed and
 * stays out of git.
 */
export type Credentials = { email: string; password: string };

export type SandboxUser = Credentials & { totpFile: string };

/** Owns every seeded row. */
export const OWNER: SandboxUser = {
  email: "owner@sandbox.invalid",
  password: "sandbox-only-password",
  totpFile: "sandbox/.owner-totp",
};

/** Owns no rows, so the security checks can try the owner's rows as someone else. */
export const SECOND_USER: SandboxUser = {
  email: "second-user@sandbox.invalid",
  password: "sandbox-only-second-password",
  totpFile: "sandbox/.second-user-totp",
};

/** The users the seed gives an authenticator. */
export const SANDBOX_USERS: readonly SandboxUser[] = [OWNER, SECOND_USER];

/**
 * Has a password and no authenticator, so the launch check can run MFA setup
 * without touching the users the other checks need. Owns no rows.
 */
export const SETUP_USER: Credentials = {
  email: "setup-user@sandbox.invalid",
  password: "sandbox-only-setup-password",
};

export function saveTotpSecret(user: SandboxUser, secret: string): void {
  writeFileSync(user.totpFile, secret);
}

export function readTotpSecret(user: SandboxUser): string {
  return readFileSync(user.totpFile, "utf8");
}
