import { test as setup } from "@playwright/test";
import { signInThroughPages } from "./signIn.ts";
import { OWNER } from "./users.ts";

setup("the fake owner signs in", async ({ page }) => {
  await signInThroughPages(page, OWNER);
  await page.context().storageState({ path: "sandbox/.session.json" });
});
