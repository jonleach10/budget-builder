import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

/** An account ID that no account has. */
const NO_ACCOUNT = "00000000-0000-4000-8000-000000000000";

/** The first of the month this many months from now, in UTC as the app reads it. */
function monthAt(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

/** Such as "2026-10". */
function monthKey(offset: number): string {
  return monthAt(offset).toISOString().slice(0, 7);
}

/** Such as "October 2026". */
function longMonth(offset: number): string {
  return monthAt(offset).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Opening Transactions from a link only shows after a click, so sandbox:shot can't reach it. */
async function picture(page: Page, name: string): Promise<void> {
  const folder = process.env.SANDBOX_SHOT_DIR ?? "sandbox/.shots";
  mkdirSync(folder, { recursive: true });
  // Next's dev badge floats over the page, and it isn't part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  // The whole page, since the pill and long lists sit below the fold.
  await page.screenshot({
    path: join(folder, `${name}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

function filter(page: Page, name: "Account" | "Type" | "Category") {
  return page.getByRole("combobox", { name, exact: true });
}

async function rowCount(page: Page): Promise<number> {
  const subtitle = await page.getByText(/^\d[\d,]* rows? in /).textContent();
  return Number.parseInt((subtitle ?? "").replace(/,/g, ""), 10);
}

/** The desktop table's column, one entry per row shown. */
function column(page: Page, name: "Account" | "Category") {
  const index = name === "Account" ? 3 : 5;
  return page.locator(`table tbody tr > td:nth-child(${index})`);
}

async function expectEvery(page: Page, name: "Account" | "Category", text: string) {
  const cells = await column(page, name).allTextContents();
  expect(cells.length, `rows shown in ${name}`).toBeGreaterThan(0);
  for (const cell of cells) expect(cell).toBe(text);
}

test("TXN-09: the account, type and category filters live in the address", async ({ page }) => {
  await page.goto(`/transactions?month=${monthKey(-1)}`);
  const all = await rowCount(page);

  await filter(page, "Account").selectOption({ label: "Sandbox Card" });
  await expect(page).toHaveURL(
    new RegExp(`/transactions\\?month=${monthKey(-1)}&account=[0-9a-f-]{36}$`),
  );
  // Each choice keeps the ones before it.
  await filter(page, "Type").selectOption({ label: "Spending" });
  await expect(page).toHaveURL(/&account=[0-9a-f-]{36}&type=spending$/);
  await filter(page, "Category").selectOption({ label: "Groceries" });
  await expect(page).toHaveURL(
    /&account=[0-9a-f-]{36}&type=spending&category=[0-9a-f-]{36}$/,
  );
  const filtered = page.url();

  // Search, Needs Review and Show Hidden stay off the address.
  await page.getByRole("searchbox", { name: "Search this month" }).fill("a");
  await expect(page).toHaveURL(filtered);
  await page.getByRole("searchbox", { name: "Search this month" }).fill("");

  await page.reload();
  await expect(filter(page, "Account").locator("option:checked")).toHaveText("Sandbox Card");
  await expect(filter(page, "Type").locator("option:checked")).toHaveText("Spending");
  await expect(filter(page, "Category").locator("option:checked")).toHaveText("Groceries");
  await expectEvery(page, "Account", "Sandbox Card");
  await expectEvery(page, "Category", "Groceries");
  expect(await rowCount(page)).toBeLessThan(all);

  // The month links keep the filters.
  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page).toHaveURL(filtered.replace(`month=${monthKey(-1)}`, `month=${monthKey(-2)}`));
  await expect(filter(page, "Category").locator("option:checked")).toHaveText("Groceries");

  // Clear Filters takes them off the address too.
  await page.getByRole("searchbox", { name: "Search this month" }).fill("no row has this text");
  await page.getByRole("button", { name: "Clear Filters" }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions\\?month=${monthKey(-2)}$`));
});

test("TXN-09: an address with an account, type or category that doesn't fit", async ({ page }) => {
  await page.goto(`/transactions?month=${monthKey(-1)}`);
  const all = await rowCount(page);

  // An account that isn't one shows every account.
  await page.goto(`/transactions?month=${monthKey(-1)}&account=${NO_ACCOUNT}`);
  await expect(filter(page, "Account").locator("option:checked")).toHaveText("All Accounts");
  expect(await rowCount(page)).toBe(all);

  // A category that isn't one keeps Spending, with All Categories.
  await page.goto(`/transactions?month=${monthKey(-1)}&type=spending&category=${NO_ACCOUNT}`);
  await expect(filter(page, "Type").locator("option:checked")).toHaveText("Spending");
  await expect(filter(page, "Category").locator("option:checked")).toHaveText("All Categories");

  // A category under another type is ignored, as the Category filter is.
  await filter(page, "Category").selectOption({ label: "Groceries" });
  const groceries = new URL(page.url()).searchParams.get("category") ?? "";
  await page.goto(`/transactions?month=${monthKey(-1)}&type=income&category=${groceries}`);
  await expect(filter(page, "Type").locator("option:checked")).toHaveText("Income");
  await expect(filter(page, "Category")).toHaveCount(0);
});

test("ACC-30: Open in Transactions opens the account on the To month", async ({ page }) => {
  // Sandbox Card on Last 3 Months, which ends last month.
  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: "Open in Transactions" })).toBeVisible();
  await picture(page, "accounts-transactions-link-desktop");
  await page.getByRole("link", { name: "Open in Transactions" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/transactions\\?month=${monthKey(-1)}&account=[0-9a-f-]{36}$`),
  );
  await expect(page.getByText(new RegExp(`^\\d[\\d,]* rows? in ${longMonth(-1)}\\.$`))).toBeVisible();
  await expect(filter(page, "Account").locator("option:checked")).toHaveText("Sandbox Card");
  await expect(filter(page, "Type").locator("option:checked")).toHaveText("All Types");
  await expectEvery(page, "Account", "Sandbox Card");
  await picture(page, "transactions-from-account-desktop");

  // The filter survives a reload.
  await page.reload();
  await expect(filter(page, "Account").locator("option:checked")).toHaveText("Sandbox Card");
});

test("ACC-30: a category row opens its Spending on the account", async ({ page }) => {
  await page.goto("/accounts");
  const table = page.getByRole("table", { name: "Spending by category" });

  // The Other row isn't one category, so it has no link.
  await expect(table.getByRole("link", { name: "Other", exact: true })).toHaveCount(0);

  const first = table.locator("tbody tr:not([data-member]) th a").first();
  const name = (await first.textContent()) ?? "";
  await first.click();

  await expect(page).toHaveURL(
    new RegExp(
      `/transactions\\?month=${monthKey(-1)}&account=[0-9a-f-]{36}&type=spending&category=[0-9a-f-]{36}$`,
    ),
  );
  await expect(filter(page, "Account").locator("option:checked")).toHaveText("Sandbox Card");
  await expect(filter(page, "Type").locator("option:checked")).toHaveText("Spending");
  await expect(filter(page, "Category").locator("option:checked")).toHaveText(name);
  await expectEvery(page, "Account", "Sandbox Card");
  await expectEvery(page, "Category", name);
  await picture(page, "transactions-from-category-desktop");
});

test("ACC-30: a category under Other opens its own rows", async ({ page }) => {
  await page.goto("/accounts");
  const member = page
    .getByRole("table", { name: "Spending by category" })
    .locator("tr[data-member] th a")
    .first();
  // Read as part of Other, such as "Other: Health".
  const name = ((await member.textContent()) ?? "").replace(/^Other: /, "");
  await member.click();

  await expect(page).toHaveURL(/&type=spending&category=[0-9a-f-]{36}$/);
  await expect(filter(page, "Category").locator("option:checked")).toHaveText(name);
  await expectEvery(page, "Category", name);
});

test("ACC-30: the links on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/accounts");

  const open = page.getByRole("link", { name: "Open in Transactions" });
  const box = await open.boundingBox();
  // Full width, inside the page's 16px gutters.
  expect(box?.width ?? 0).toBeGreaterThan(PHONE.width - 64);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    "the page scrolls sideways",
  ).toBeLessThanOrEqual(0);
  await picture(page, "accounts-transactions-link-phone");

  await page
    .getByRole("list", { name: "Spending by category" })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/&type=spending&category=[0-9a-f-]{36}$/);
  await picture(page, "transactions-from-category-phone");
});
