import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { OWNER, SANDBOX_USERS, SECOND_USER, SETUP_USER } from "./users.ts";

function isIgnoredByGit(path: string): boolean {
  return spawnSync("git", ["check-ignore", "--quiet", path]).status === 0;
}

describe("the sandbox's users", () => {
  it("are the fake owner and a second user", () => {
    expect(SANDBOX_USERS).toEqual([OWNER, SECOND_USER]);
    expect(OWNER.email).toBe("owner@sandbox.invalid");
  });

  it("each have their own email, password and TOTP secret file", () => {
    for (const key of ["email", "password", "totpFile"] as const) {
      expect(new Set(SANDBOX_USERS.map((user) => user[key])).size).toBe(2);
    }
  });

  // .invalid is reserved, so no real mailbox can have these addresses.
  it.each(SANDBOX_USERS)("$email can't be a real address", ({ email }) => {
    expect(email).toMatch(/^[a-z-]+@sandbox\.invalid$/);
  });

  it.each(SANDBOX_USERS)("keeps $email's TOTP secret out of git", ({ totpFile }) => {
    expect(totpFile.startsWith("sandbox/")).toBe(true);
    expect(isIgnoredByGit(totpFile)).toBe(true);
  });
});

describe("the setup user", () => {
  it("can't be a real address", () => {
    expect(SETUP_USER.email).toMatch(/^[a-z-]+@sandbox\.invalid$/);
  });

  it("has its own email and password", () => {
    for (const user of SANDBOX_USERS) {
      expect(SETUP_USER.email).not.toBe(user.email);
      expect(SETUP_USER.password).not.toBe(user.password);
    }
  });

  // MFA setup is what it's for, so the seed never gives it a factor or a secret file.
  it("has no TOTP secret file", () => {
    expect(SETUP_USER).not.toHaveProperty("totpFile");
  });
});
