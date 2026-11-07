import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Each test saves through the real screen, then reloads to prove it was stored.
 * These merchants are ones the Edit Row flows don't use, because this file runs
 * first on the same rows.
 */
test.describe.configure({ mode: "serial" });

function lastMonth(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  return start.toISOString().slice(0, 7);
}

async function rowsLeft(page: Page): Promise<number> {
  const subtitle = await page.getByText(/^[\d,]+ rows? left\.$/).textContent();
  return Number.parseInt((subtitle ?? "").replaceAll(",", ""), 10);
}

/** These states only show after a click, so sandbox:shot can't reach them. */
async function picture(page: Page, name: string): Promise<void> {
  const folder = process.env.SANDBOX_SHOT_DIR ?? "sandbox/.shots";
  mkdirSync(folder, { recursive: true });
  // Next's dev badge floats over rows, and it isn't part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({
    path: join(folder, `${name}.png`),
    animations: "disabled",
  });
}

const groupButton = (page: Page, name: string) =>
  page
    .getByRole("region", { name: "Merchants" })
    .getByRole("button", { name: new RegExp(`^${name}`) });

test.beforeEach(async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Review Inbox" })).toBeVisible();
});

test("the largest group is open, and Accept waits for a category", async ({ page }) => {
  await expect(page.locator('[aria-expanded="true"]')).toHaveCount(1);
  const accept = page.getByRole("button", { name: /^Accept \d+ Rows?$/ });
  await expect(accept).toHaveCount(1);
  await expect(accept).toBeDisabled();
});

test("accepting a group saves every row in it, and they leave the inbox", async ({ page }) => {
  const before = await rowsLeft(page);
  await groupButton(page, "SAMPLE DELI").click();
  await expect(groupButton(page, "SAMPLE DELI")).toHaveAttribute("aria-expanded", "true");

  const accept = page.getByRole("button", { name: /^Accept \d+ Rows?$/ });
  const count = Number((await accept.textContent())?.match(/\d+/)?.[0]);
  await page.getByLabel("Category").selectOption({ label: "Dining" });
  await accept.click();

  await expect(page.getByRole("status")).toHaveText(`${count} rows were saved.`);
  await expect(groupButton(page, "SAMPLE DELI")).toHaveCount(0);

  await page.reload();
  await expect(groupButton(page, "SAMPLE DELI")).toHaveCount(0);
  expect(await rowsLeft(page)).toBe(before - count);
});

test("a row changed on its own teaches a suggestion, which only Use fills in", async ({ page }) => {
  const before = await rowsLeft(page);
  await groupButton(page, "SAMPLE TRANSIT").click();
  await expect(page.getByText(/^Suggested:/)).toHaveCount(0);

  await page.getByRole("button", { name: /^Change SAMPLE TRANSIT from/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Category").selectOption({ label: "Gas" });
  await dialog.getByRole("button", { name: "Save Row" }).click();
  await expect(dialog).toBeHidden();

  // The changed row left, and the rest of the group is still waiting.
  await expect(page.getByText("Suggested: Gas", { exact: true })).toBeVisible();
  expect(await rowsLeft(page)).toBe(before - 1);
  const category = page.getByRole("region", { name: "Merchants" }).getByLabel("Category");
  await expect(category).toHaveValue("");
  await picture(page, "review-suggestion-offered-laptop");

  await page.getByRole("button", { name: "Use", exact: true }).click();
  await expect(category.locator("option:checked")).toHaveText("Gas");
  await picture(page, "review-suggestion-used-laptop");
  expect(await rowsLeft(page)).toBe(before - 1);

  await page.getByRole("button", { name: /^Accept \d+ Rows?$/ }).click();
  await expect(groupButton(page, "SAMPLE TRANSIT")).toHaveCount(0);

  await page.goto(`/transactions?month=${lastMonth()}`);
  await page.getByLabel("Needs Review").check();
  await expect(page.getByRole("row").filter({ hasText: "SAMPLE TRANSIT" })).toHaveCount(0);
});

test("a redacted group asks for its rows to be checked, and can be accepted whole", async ({ page }) => {
  const redacted = "Erstattung \\[REDACTED\\]";
  const reminder = "Redacted text. Check the rows before you accept.";

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await groupButton(page, redacted).click();
  await expect(groupButton(page, redacted)).toContainText(/\d+ rows? · Redacted text/);
  await groupButton(page, redacted).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await picture(page, "review-redacted-group-phone");

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await groupButton(page, redacted).click();
  await expect(groupButton(page, redacted)).toContainText(reminder);
  await groupButton(page, redacted).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await picture(page, "review-redacted-group-laptop");

  const before = await rowsLeft(page);
  const accept = page.getByRole("button", { name: /^Accept \d+ Rows?$/ });
  const count = Number((await accept.textContent())?.match(/\d+/)?.[0]);
  await page.getByLabel("Category").selectOption({ label: "Shopping" });
  await accept.click();

  await expect(page.getByRole("status")).toHaveText(`${count} rows were saved.`);
  await page.reload();
  await expect(groupButton(page, redacted)).toHaveCount(0);
  expect(await rowsLeft(page)).toBe(before - count);
});

test("a No Merchant row takes a label on its own, and stays to be decided", async ({ page }) => {
  await page.getByRole("link", { name: /^No Merchant/ }).click();
  await expect(page).toHaveURL(/section=no-merchant/);
  await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(0);
  const before = await rowsLeft(page);

  const card = page.getByRole("region", { name: /^Row from / }).first();
  const label = card.getByLabel("Label", { exact: true });
  await expect(label).toHaveAttribute("placeholder", "Corner Market");
  await label.fill("  Sample payee  ");
  await card.getByRole("button", { name: "Save Row" }).click();
  await expect(card.getByRole("button", { name: "Save Row" })).toBeDisabled();

  await page.reload();
  await expect(
    page.getByRole("region", { name: /^Row from / }).first().getByLabel("Label", { exact: true }),
  ).toHaveValue("Sample payee");
  expect(await rowsLeft(page)).toBe(before);
});

test("a No Merchant row is decided one at a time", async ({ page }) => {
  await page.goto("/review?section=no-merchant");
  const before = await rowsLeft(page);

  const card = page.getByRole("region", { name: /^Row from / }).first();
  await card.getByLabel("Category").selectOption({ label: "Housing" });
  await card.getByRole("button", { name: "Save Row" }).click();

  await expect.poll(() => rowsLeft(page)).toBe(before - 1);
  await page.reload();
  expect(await rowsLeft(page)).toBe(before - 1);
});

test("Budget's needs-review text opens the inbox", async ({ page }) => {
  await page.goto(`/budget?month=${lastMonth()}`);
  await page.getByRole("link", { name: /rows? needs? review/ }).click();

  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole("heading", { name: "Review Inbox" })).toBeVisible();
});

test("the inbox fits a phone, with the group's rows as a list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("list", { name: "Rows in this group" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
});
