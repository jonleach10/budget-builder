import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

const CARD = "Sandbox Card · Ending 2222";
const SAVINGS = "Sandbox Savings · Ending 4444";
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

/** Such as "May to July 2026", or "November 2024 to October 2025" across a year. */
function monthsText(fromOffset: number, toOffset: number): string {
  const from = monthAt(fromOffset);
  const to = monthAt(toOffset);
  const name = from.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return from.getUTCFullYear() === to.getUTCFullYear()
    ? `${name} to ${longMonth(toOffset)}`
    : `${longMonth(fromOffset)} to ${longMonth(toOffset)}`;
}

/** This Month in words: from the 1st to today. */
function thisMonthText(): string {
  const now = new Date();
  const name = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `from ${name} 1 to ${name} ${now.getUTCDate()}, ${now.getUTCFullYear()}`;
}

function periodNav(page: Page) {
  return page.getByRole("navigation", { name: "Period" });
}

function shortcut(page: Page, name: string) {
  return periodNav(page).getByRole("link", { name, exact: true });
}

/** The phone selects are in the page too, hidden, so these name the shown ones. */
function monthSelect(page: Page, name: "From" | "To") {
  return page.getByRole("combobox", { name, exact: true });
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

function categoryList(page: Page) {
  return page.getByRole("list", { name: "Spending by category" });
}

/** The donut is one image, named with the figure in its middle. */
function donut(page: Page) {
  return page.getByRole("img", { name: /^Spending by category, / });
}

/** The figure the donut's name gives, such as "$829.14". */
async function donutFigure(page: Page): Promise<string> {
  const name = await donut(page).getAttribute("aria-label");
  const figure = name?.match(/^Spending by category, (\S+) in all\. The list shows every figure\.$/);
  expect(figure, `the donut's name: ${name}`).not.toBeNull();
  return figure?.[1] ?? "";
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
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
    SAVINGS,
  ]);

  await picker(page).selectOption({ label: GIROKONTO });

  // The picker keeps the period, so the address names it too.
  await expect(page).toHaveURL(
    new RegExp(`/accounts\\?account=[0-9a-f-]+&from=${monthKey(-3)}&to=${monthKey(-1)}$`),
  );
  await expect(page.getByText(`Amounts are in EUR, ${lastThreeMonths()}.`)).toBeVisible();
  // The seed's Girokonto has no decided Spending in the period, so it shows the
  // no-Spending line. Once it has some, its Total is in euros.
  await expect(
    categoryTable(page)
      .getByRole("row")
      .last()
      .filter({ hasText: /^Total€/ })
      .or(page.getByText(`No Spending ${lastThreeMonths()}.`)),
  ).toBeVisible();

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

test("ACC-04: the shortcuts set the period in the address and change every figure", async ({
  page,
}) => {
  await page.goto("/accounts");
  const table = categoryTable(page);
  const total = table.getByRole("row").last();

  await expect(shortcut(page, "Last 3 Months")).toHaveAttribute("aria-current", "page");
  await expect(monthSelect(page, "From")).toHaveValue(monthKey(-3));
  await expect(monthSelect(page, "To")).toHaveValue(monthKey(-1));
  await expect(
    page.getByText(`Change is against ${monthsText(-6, -4)}, the 3 months before.`),
  ).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Change" })).toBeVisible();
  await expect(total).toContainText(/Total\$[\d,]+\.\d{2}100%([+-]\d+%|0%|New)$/);
  const lastThree = await total.textContent();
  await picture(page, "accounts-last-3-months-desktop");

  await shortcut(page, "This Month").click();
  await expect(page).toHaveURL(new RegExp(`from=${monthKey(0)}&to=${monthKey(0)}$`));
  await expect(shortcut(page, "This Month")).toHaveAttribute("aria-current", "page");
  await expect(periodNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByText(`Amounts are in USD, ${thisMonthText()}.`)).toBeVisible();
  await expect(
    page.getByText(`Change is against ${longMonth(-1)}, the month before.`),
  ).toBeVisible();

  await shortcut(page, "Last 12 Months").click();
  await expect(page).toHaveURL(new RegExp(`from=${monthKey(-12)}&to=${monthKey(-1)}$`));
  await expect(shortcut(page, "Last 12 Months")).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText(`Change is against ${monthsText(-24, -13)}, the 12 months before.`),
  ).toBeVisible();
  // Last 12 Months holds Last 3 Months and the seeded month before it, so it's more.
  await expect(total).not.toHaveText(lastThree ?? "");

  await shortcut(page, "All Months").click();
  await expect(page).toHaveURL(/&period=all$/);
  await expect(shortcut(page, "All Months")).toHaveAttribute("aria-current", "page");
  // From is the first month with rows, which is the first month offered.
  const firstOffered = await monthSelect(page, "From").locator("option").first().getAttribute("value");
  await expect(monthSelect(page, "From")).toHaveValue(firstOffered ?? "");
  await expect(
    page.getByText(
      "All Months has no earlier period to compare with, so there's no Change column.",
    ),
  ).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Change" })).toHaveCount(0);
  await expect(total).toContainText(/Total\$[\d,]+\.\d{2}100%$/);
  await picture(page, "accounts-all-months-desktop");
});

test("ACC-04: the period row on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/accounts");

  const links = periodNav(page).getByRole("link");
  await expect(links).toHaveText(["This Month", "Last 3 Months", "Last 12 Months", "All Months"]);
  // Two by two: This Month and Last 12 Months start the two rows.
  const first = await links.nth(0).boundingBox();
  const third = await links.nth(2).boundingBox();
  expect(third?.x).toBe(first?.x);
  expect(third?.y ?? 0).toBeGreaterThan(first?.y ?? 0);

  const short = monthAt(-3).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  await expect(monthSelect(page, "From").locator("option:checked")).toHaveText(short);
  const from = await monthSelect(page, "From").boundingBox();
  const to = await monthSelect(page, "To").boundingBox();
  expect(to?.y).toBe(from?.y);

  const list = page.getByRole("list", { name: "Spending by category" });
  await expect(list.getByRole("listitem").last()).toContainText(/100% · ([+-]\d+%|0%|New)/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-period-phone");
});

test("ACC-05: From and To choose any range", async ({ page }) => {
  await page.goto("/accounts");

  await monthSelect(page, "From").selectOption(monthKey(-1));
  await expect(page).toHaveURL(new RegExp(`from=${monthKey(-1)}&to=${monthKey(-1)}$`));
  await expect(periodNav(page).locator('[aria-current="page"]')).toHaveCount(0);
  await expect(page.getByText(`Amounts are in USD, for ${longMonth(-1)}.`)).toBeVisible();
  await expect(
    page.getByText(`Change is against ${longMonth(-2)}, the month before.`),
  ).toBeVisible();

  // A To before From moves From back to it.
  await monthSelect(page, "To").selectOption(monthKey(-4));
  await expect(page).toHaveURL(new RegExp(`from=${monthKey(-4)}&to=${monthKey(-4)}$`));

  // A From after To moves To up to it. The month in progress alone is This Month.
  await monthSelect(page, "From").selectOption(monthKey(0));
  await expect(page).toHaveURL(new RegExp(`from=${monthKey(0)}&to=${monthKey(0)}$`));
  await expect(shortcut(page, "This Month")).toHaveAttribute("aria-current", "page");

  // A reversed range in the address falls back to Last 3 Months.
  await page.goto(`/accounts?from=${monthKey(-1)}&to=${monthKey(-4)}`);
  await expect(shortcut(page, "Last 3 Months")).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(`Amounts are in USD, ${lastThreeMonths()}.`)).toBeVisible();
});

test("ACC-06: the page opens on the account viewed last", async ({ page, context }) => {
  await page.goto("/accounts");
  await picker(page).selectOption({ label: GIROKONTO });
  await expect(page.getByText(`Amounts are in EUR, ${lastThreeMonths()}.`)).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(picker(page).locator("option:checked")).toHaveText(GIROKONTO);

  // The cookie holds the account's ID and nothing else.
  const remembered = (await context.cookies()).find(({ name }) => name === "last-account");
  expect(remembered?.value).toMatch(/^[0-9a-f-]{36}$/);

  // An account that no longer exists opens the first account.
  await context.addCookies([
    {
      name: "last-account",
      value: "00000000-0000-4000-8000-000000000000",
      domain: "127.0.0.1",
      path: "/accounts",
    },
  ]);
  await page.goto("/accounts");
  await expect(picker(page).locator("option:checked")).toHaveText(CARD);
});

test("ACC-07: the back button returns to the period before", async ({ page }) => {
  await page.goto("/accounts");
  await shortcut(page, "This Month").click();
  await expect(shortcut(page, "This Month")).toHaveAttribute("aria-current", "page");
  await shortcut(page, "All Months").click();
  await expect(shortcut(page, "All Months")).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`from=${monthKey(0)}&to=${monthKey(0)}$`));
  await expect(shortcut(page, "This Month")).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(`Amounts are in USD, ${thisMonthText()}.`)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(shortcut(page, "Last 3 Months")).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(`Amounts are in USD, ${lastThreeMonths()}.`)).toBeVisible();
});

test("ACC-08: the donut shows Spending by category beside the list", async ({ page }) => {
  await page.goto("/accounts");
  const table = categoryTable(page);
  await expect(donut(page)).toBeVisible();

  // The middle figure is the sum of the slices, which here is the Total.
  const figure = await donutFigure(page);
  await expect(donut(page).getByText(figure, { exact: true })).toBeAttached();
  await expect(donut(page).getByText("Spending", { exact: true })).toBeAttached();
  await expect(table.getByRole("row").last()).toContainText(`Total${figure}100%`);

  // Every share on the ring is in the list, which carries every figure.
  const shares = await table.locator("tbody tr > td:nth-child(3)").allTextContents();
  const ringLabels = (await donut(page).locator("text").allTextContents()).filter((text) =>
    /^\d+%$/.test(text),
  );
  expect(ringLabels.length).toBeGreaterThan(0);
  for (const label of ringLabels) expect(shares).toContain(label);

  // Beside the list on a desktop.
  const chart = await donut(page).boundingBox();
  const list = await table.boundingBox();
  expect(chart?.x ?? 0).toBeLessThan(list?.x ?? 0);
  expect(chart?.width).toBe(280);
  await picture(page, "accounts-donut-desktop");
});

test("ACC-08: the donut sits above the list on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/accounts");
  await expect(donut(page)).toBeVisible();

  const figure = await donutFigure(page);
  const list = categoryList(page);
  await expect(list.getByRole("listitem").last()).toContainText(`Total${figure}`);

  const chart = await donut(page).boundingBox();
  const listBox = await list.boundingBox();
  expect((chart?.y ?? 0) + (chart?.height ?? 0)).toBeLessThanOrEqual(listBox?.y ?? 0);
  expect(chart?.width).toBe(248);

  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-donut-phone");
});

test("ACC-09: an account with no Spending shows a plain line instead of the donut", async ({
  page,
}) => {
  await page.goto("/accounts");
  await picker(page).selectOption({ label: SAVINGS });
  await expect(page.getByText(`Amounts are in USD, ${lastThreeMonths()}.`)).toBeVisible();

  await expect(page.getByText(`No Spending ${lastThreeMonths()}.`)).toBeVisible();
  await expect(
    page.getByText("Only Spending rows count here, so transfers and income aren't shown."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spending by Category" })).toBeVisible();
  await expect(donut(page)).toHaveCount(0);
  await expect(categoryTable(page)).toHaveCount(0);
  await expect(page.getByText(/^Change is against/)).toHaveCount(0);
  // The period controls stay, because the account has rows.
  await expect(shortcut(page, "Last 3 Months")).toHaveAttribute("aria-current", "page");
  await picture(page, "accounts-no-spending-desktop");

  await page.setViewportSize(PHONE);
  await expect(page.getByText(`No Spending ${lastThreeMonths()}.`)).toBeVisible();
  await expect(categoryList(page)).toHaveCount(0);
  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-no-spending-phone");
});
