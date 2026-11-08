import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

const CARD = "Sandbox Card · Ending 2222";
const GIROKONTO = "Sandbox Girokonto · Ending 3333";
const NO_ROWS = "Sandbox Commerzbank Savings · Ending 5555";

/** Last 3 Months in words: the three full months before this one. */
function lastThreeMonths(): string {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const day = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const firstYear = first.getUTCFullYear();
  const lastYear = last.getUTCFullYear();

  return firstYear === lastYear
    ? `from ${day(first)} to ${day(last)}, ${lastYear}`
    : `from ${day(first)}, ${firstYear}, to ${day(last)}, ${lastYear}`;
}

/** The no-rows state only shows after picking its account, so sandbox:shot can't reach it. */
async function picture(page: Page, name: string): Promise<void> {
  const folder = process.env.SANDBOX_SHOT_DIR ?? "sandbox/.shots";
  mkdirSync(folder, { recursive: true });
  // Next's dev badge floats over the page, and it isn't part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({
    path: join(folder, `${name}.png`),
    animations: "disabled",
  });
}

function picker(page: Page) {
  return page.getByRole("combobox", { name: "Account" });
}

/** The phone list is in the page too, hidden, so this names the desktop table. */
function categoryTable(page: Page) {
  return page.getByRole("table", { name: "Spending by category" });
}

test("ACC-01: the sidebar opens the Account page on the first account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Accounts" }).click();

  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Accounts" })).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(picker(page).locator("option:checked")).toHaveText(CARD);
  await expect(page.getByText(`Amounts are in USD, ${lastThreeMonths()}.`)).toBeVisible();

  const table = categoryTable(page);
  await expect(table.getByRole("rowheader", { name: "Groceries" })).toBeVisible();
  await expect(table.getByRole("row").last()).toContainText(/Total\$[\d,]+\.\d{2}100%/);
});

test("ACC-01: the sidebar opens the Account page on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("link", { name: "Accounts" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
  const list = page.getByRole("list", { name: "Spending by category" });
  await expect(list.getByRole("listitem").filter({ hasText: "Groceries" })).toBeVisible();
  await expect(list.getByRole("listitem").last()).toContainText("Total");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
});

test("ACC-02: choosing another account shows it, in its own currency", async ({ page }) => {
  await page.goto("/accounts");
  await expect(picker(page).locator("option")).toHaveText([
    CARD,
    "Sandbox Checking · Ending 1111",
    NO_ROWS,
    GIROKONTO,
    "Sandbox Savings · Ending 4444",
  ]);

  await picker(page).selectOption({ label: GIROKONTO });

  await expect(page).toHaveURL(/\/accounts\?account=[0-9a-f-]+$/);
  await expect(page.getByText(`Amounts are in EUR, ${lastThreeMonths()}.`)).toBeVisible();
  await expect(categoryTable(page).getByRole("row").last()).toContainText(/Total€/);

  await page.reload();
  await expect(picker(page).locator("option:checked")).toHaveText(GIROKONTO);
  await expect(page.getByText(`Amounts are in EUR, ${lastThreeMonths()}.`)).toBeVisible();
});

test("ACC-03: an account with no rows points to Import", async ({ page }) => {
  await page.goto("/accounts");
  await picker(page).selectOption({ label: NO_ROWS });

  await expect(
    page.getByRole("heading", { name: "No rows in Sandbox Commerzbank Savings" }),
  ).toBeVisible();
  await expect(
    page.getByText("Import a statement for this account to see its spending."),
  ).toBeVisible();
  await expect(page.getByText("Amounts are in EUR.", { exact: true })).toBeVisible();
  await expect(page.getByText(/from .* to /)).toHaveCount(0);
  await expect(page.getByText("Spending by Category")).toHaveCount(0);
  await expect(picker(page)).toBeVisible();
  await picture(page, "accounts-no-rows-desktop");

  await page.setViewportSize(PHONE);
  await expect(page.getByRole("link", { name: "Go to Import" })).toBeVisible();
  await picture(page, "accounts-no-rows-phone");

  await page.getByRole("link", { name: "Go to Import" }).click();
  await expect(page).toHaveURL(/\/import$/);
});
