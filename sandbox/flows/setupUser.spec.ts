import { expect, test } from "@playwright/test";
import { SETUP_USER } from "../users.ts";

// Starts signed out, not with the owner's saved session.
test.use({ storageState: { cookies: [], origins: [] } });

// Stops at the setup page, so the user still has no authenticator for the launch check's setup flow.
test("the setup user logs in with a password and is sent to Set Up Authenticator", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SETUP_USER.email);
  await page.getByLabel("Password").fill(SETUP_USER.password);
  await page.getByRole("button", { name: "Log In" }).click();

  await page.waitForURL("**/login/mfa/setup");
  await expect(page.getByRole("heading", { name: "Set Up Authenticator" })).toBeVisible();
});
