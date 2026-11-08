import type { Page } from "@playwright/test";
import { totpCode } from "./totp.ts";
import { readTotpSecret, type SandboxUser } from "./users.ts";

/** Through the real pages, with a real TOTP code, so nothing bypasses sign-in. */
export async function signInThroughPages(page: Page, user: SandboxUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log In" }).click();

  await page.waitForURL("**/login/mfa");
  await page.getByLabel("Code").fill(totpCode(readTotpSecret(user), Date.now() / 1000));
  await page.getByRole("button", { name: "Verify Code" }).click();

  await page.waitForURL(({ pathname }) => pathname === "/");
}
