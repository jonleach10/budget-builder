import { test as setup } from "@playwright/test";
import { OWNER_EMAIL, OWNER_PASSWORD, readTotpSecret } from "./owner.ts";
import { totpCode } from "./totp.ts";

/** Through the real pages, with a real TOTP code, so nothing bypasses sign-in. */
setup("the fake owner signs in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log In" }).click();

  await page.waitForURL("**/login/mfa");
  await page.getByLabel("Code").fill(totpCode(readTotpSecret(), Date.now() / 1000));
  await page.getByRole("button", { name: "Verify Code" }).click();

  await page.waitForURL(({ pathname }) => pathname === "/");
  await page.context().storageState({ path: "sandbox/.session.json" });
});
