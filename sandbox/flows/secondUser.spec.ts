import { expect, test } from "@playwright/test";
import { signInThroughPages } from "../signIn.ts";
import { SECOND_USER } from "../users.ts";

// Starts signed out, not with the owner's saved session.
test.use({ storageState: { cookies: [], origins: [] } });

// One sign-in, because a second within 30 seconds would reuse the same code.
test("the second user signs in with their own MFA and sees none of the owner's rows", async ({
  page,
}) => {
  await signInThroughPages(page, SECOND_USER);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  // Every seeded row is the owner's, and SAMPLE starts most of their text.
  await expect(page.getByText(/SAMPLE/)).toHaveCount(0);
});
