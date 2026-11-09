import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

const CARD = "Sandbox Card · Ending 2222";
const SAVINGS = "Sandbox Savings · Ending 4444";
const GIROKONTO = "Sandbox Girokonto · Ending 3333";
const NO_ROWS = "Sandbox Commerzbank Savings · Ending 5555";

const ALL_NEED_REVIEW = "Every row in this period needs review";

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
async function picture(
  page: Page,
  name: string,
  { full = false }: { full?: boolean } = {},
): Promise<void> {
  const folder = process.env.SANDBOX_SHOT_DIR ?? "sandbox/.shots";
  mkdirSync(folder, { recursive: true });
  // Next's dev badge floats over the page, and it isn't part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({
    path: join(folder, `${name}.png`),
    animations: "disabled",
    // The trend and Top Merchants sit below the fold, so their pictures take the whole page.
    fullPage: full,
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
  // Every row on the seed's Girokonto needs review, so it shows the panel of
  // ACC-13. Once it has decided Spending, its Total is in euros.
  await expect(
    categoryTable(page)
      .getByRole("row")
      .last()
      .filter({ hasText: /^Total€/ })
      .or(page.getByRole("heading", { name: ALL_NEED_REVIEW })),
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

/** "$1,234.56" in cents, to add up figures the page shows. */
function cents(money: string): number {
  return Math.round(Number(money.replace(/[$,\s]/g, "")) * 100);
}

function slices(page: Page) {
  return donut(page).locator("path[data-slice]");
}

test("ACC-10: Other groups the smaller categories, listed under it", async ({ page }) => {
  await page.goto("/accounts");
  const table = categoryTable(page);

  // The top 6, then Other, the only hatched slice.
  await expect(slices(page)).toHaveCount(7);
  await expect(donut(page).locator('path[data-slice="other"]')).toHaveCount(1);
  await expect(slices(page).last()).toHaveAttribute("data-slice", "other");

  const other = table.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Other", exact: true }),
  });
  await expect(other).toHaveCount(1);

  // Its categories under it, each read as part of Other, adding up to it.
  const members = table.locator("tr[data-member]");
  await expect(members).toHaveCount(3);
  for (const header of await members.getByRole("rowheader").allTextContents()) {
    expect(header).toMatch(/^Other: \S/);
  }
  const memberAmounts = await members.locator("td:nth-child(2)").allTextContents();
  const otherAmount = await other.getByRole("cell").first().textContent();
  expect(memberAmounts.reduce((sum, amount) => sum + cents(amount), 0)).toBe(
    cents(otherAmount ?? ""),
  );
  for (const share of await members.locator("td:nth-child(3)").allTextContents()) {
    expect(share).toMatch(/^\d+%$/);
  }
  // Then the Total, after Other's categories.
  await expect(table.getByRole("row").last()).toContainText("Total");
  await picture(page, "accounts-other-desktop");
});

test("ACC-10: Other's categories sit under it on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/accounts");

  const list = categoryList(page);
  await expect(list.getByRole("listitem").filter({ hasText: /^Other/ }).first()).toBeVisible();
  const members = page.getByRole("list", { name: "In Other" }).getByRole("listitem");
  await expect(members).toHaveCount(3);
  for (const text of await members.allTextContents()) {
    expect(text).toMatch(/^Other: .+\$[\d,]+\.\d{2}\d+% · ([+-]\d+%|0%|New)$/);
  }

  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-other-phone");
});

test("ACC-10: a month with exactly 7 categories has no Other", async ({ page }) => {
  // The card's first month with rows has 7 categories with Spending.
  await page.goto(`/accounts?from=${monthKey(-4)}&to=${monthKey(-4)}`);
  const table = categoryTable(page);

  await expect(slices(page)).toHaveCount(7);
  await expect(donut(page).locator('path[data-slice="other"]')).toHaveCount(0);
  await expect(slices(page).last()).toHaveAttribute("data-slice", "7");
  await expect(table.getByRole("rowheader", { name: "Other", exact: true })).toHaveCount(0);
  await expect(table.locator("tr[data-member]")).toHaveCount(0);
  await expect(table.locator("tbody tr")).toHaveCount(7);
  await picture(page, "accounts-seven-desktop");
});

function trendCard(page: Page) {
  return page.getByRole("region", { name: "Monthly spending" });
}

/** Each month of the trend is a button named with its month and figure. */
function trendMonths(page: Page) {
  return trendCard(page).getByRole("button", { name: /^\w+ \d{4}: spending / });
}

function trendMonth(page: Page, offset: number) {
  return trendCard(page).getByRole("button", {
    name: new RegExp(`^${longMonth(offset)}: spending `),
  });
}

/** The month names of the trend's points, in order. */
async function trendMonthNames(page: Page): Promise<string[]> {
  const labels = await trendMonths(page).evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label") ?? ""),
  );
  return labels.map((label) => label.split(":")[0]);
}

/** Such as ["October 2026", "November 2026"], from the first offset to the last. */
function monthNames(fromOffset: number, toOffset: number): string[] {
  return Array.from({ length: toOffset - fromOffset + 1 }, (_, index) =>
    longMonth(fromOffset + index),
  );
}

function oneMonthHint(offset: number): string {
  return `One month has one point, so the chart shows the 12 months up to ${longMonth(offset)}.`;
}

test("ACC-20: Last 3 Months has a point for each month, an empty one at $0", async ({ page }) => {
  await page.goto("/accounts");
  const card = trendCard(page);

  await expect(card.getByRole("heading", { name: "Monthly Spending" })).toBeVisible();
  // It comes after Spending by Category.
  const category = await page.getByRole("heading", { name: "Spending by Category" }).boundingBox();
  const trend = await card.boundingBox();
  expect(trend?.y ?? 0).toBeGreaterThan(category?.y ?? 0);

  expect(await trendMonthNames(page)).toEqual(monthNames(-3, -1));
  // The seed leaves its second month, the first of Last 3 Months, empty.
  await expect(trendMonth(page, -3)).toHaveAttribute(
    "aria-label",
    `${longMonth(-3)}: spending $0.00`,
  );
  await expect(trendMonth(page, -1)).toHaveAttribute(
    "aria-label",
    /: spending \$[\d,]+\.\d{2}$/,
  );
  // Several months need no hint and highlight none.
  await expect(card.getByText(/^One month has one point/)).toHaveCount(0);
  await expect(card.locator("[data-band]")).toHaveCount(0);
  // One line, so no legend: the label beside its end names it.
  await expect(card.getByText("Spending", { exact: true })).toHaveCount(1);
  await picture(page, "accounts-trend-last-3-months-desktop", { full: true });
});

test("ACC-21: a one-month period shows the 12 months up to it, highlighted", async ({ page }) => {
  await page.goto(`/accounts?from=${monthKey(-1)}&to=${monthKey(-1)}`);
  const card = trendCard(page);

  await expect(card.getByText(oneMonthHint(-1))).toBeVisible();
  expect(await trendMonthNames(page)).toEqual(monthNames(-12, -1));
  // Months before the seed's first are $0.
  await expect(trendMonth(page, -12)).toHaveAttribute(
    "aria-label",
    `${longMonth(-12)}: spending $0.00`,
  );

  // The highlight: a band over the month, a larger dot and its figure in a tag.
  await expect(card.locator("[data-band]")).toBeVisible();
  await expect(card.locator('[data-dot="highlighted"]')).toHaveCount(1);
  const label = await trendMonth(page, -1).getAttribute("aria-label");
  const figure = label?.split(": spending ")[1] ?? "";
  await expect(card.locator('[data-tag="figure"]')).toHaveText(figure);
  // It's the period's Spending, the list's Total.
  await expect(categoryTable(page).getByRole("row").last()).toContainText(`Total${figure}`);
  // The year sits under the first month and under January.
  await expect(card.getByText(String(monthAt(-12).getUTCFullYear()), { exact: true })).toBeVisible();
  await picture(page, "accounts-trend-one-month-desktop", { full: true });

  await page.setViewportSize(PHONE);
  const short = monthAt(-1).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  await expect(card.getByText(`${short} ${figure}`, { exact: true })).toBeVisible();
  await expect(card.getByText(longMonth(-12), { exact: true })).toBeVisible();
  await expect(card.getByText(longMonth(-1), { exact: true })).toBeVisible();
  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-trend-one-month-phone", { full: true });
});

test("ACC-22: This Month shows the 12 months up to the month in progress", async ({ page }) => {
  await page.goto("/accounts");
  await shortcut(page, "This Month").click();
  await expect(shortcut(page, "This Month")).toHaveAttribute("aria-current", "page");
  const card = trendCard(page);

  await expect(card.getByText(oneMonthHint(0))).toBeVisible();
  expect(await trendMonthNames(page)).toEqual(monthNames(-11, 0));
  await expect(card.locator("[data-band]")).toBeVisible();
});

test("ACC-23: Last 12 Months shows 12 points with none highlighted", async ({ page }) => {
  await page.goto("/accounts");
  await shortcut(page, "Last 12 Months").click();
  await expect(shortcut(page, "Last 12 Months")).toHaveAttribute("aria-current", "page");
  const card = trendCard(page);

  expect(await trendMonthNames(page)).toEqual(monthNames(-12, -1));
  await expect(card.locator("[data-band]")).toHaveCount(0);
  await expect(card.getByText(/^One month has one point/)).toHaveCount(0);
  // Months before the seed's first, and its empty month, are $0.
  for (const offset of [-12, -5, -3]) {
    await expect(trendMonth(page, offset)).toHaveAttribute(
      "aria-label",
      `${longMonth(offset)}: spending $0.00`,
    );
  }
});

test("ACC-24: All Months runs from the first month with rows to the last", async ({ page }) => {
  await page.goto("/accounts");
  await shortcut(page, "All Months").click();
  await expect(shortcut(page, "All Months")).toHaveAttribute("aria-current", "page");
  const card = trendCard(page);

  // From and To hold the first and last months with rows: the seed's first month,
  // and this month unless nothing has posted in it yet.
  await expect(monthSelect(page, "From")).toHaveValue(monthKey(-4));
  const last = await monthSelect(page, "To").inputValue();
  const lastOffset = last === monthKey(0) ? 0 : -1;
  expect(await trendMonthNames(page)).toEqual(monthNames(-4, lastOffset));
  await expect(card.locator("[data-band]")).toHaveCount(0);
  await picture(page, "accounts-trend-all-months-desktop", { full: true });

  await page.setViewportSize(PHONE);
  await expect(card.getByText(longMonth(-4), { exact: true })).toBeVisible();
  await expect(card.getByText(longMonth(lastOffset), { exact: true })).toBeVisible();
  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-trend-all-months-phone", { full: true });
});

test("ACC-25: the trend stays when the period has no Spending but other months do", async ({
  page,
}) => {
  // The seed's empty month.
  await page.goto(`/accounts?from=${monthKey(-3)}&to=${monthKey(-3)}`);
  const card = trendCard(page);

  await expect(page.getByText(`No Spending for ${longMonth(-3)}.`)).toBeVisible();
  await expect(card.getByText(oneMonthHint(-3))).toBeVisible();
  expect(await trendMonthNames(page)).toEqual(monthNames(-14, -3));
  await expect(card.locator('[data-tag="figure"]')).toHaveText("$0.00");
  await expect(trendMonth(page, -4)).toHaveAttribute(
    "aria-label",
    /: spending \$[\d,]+\.\d{2}$/,
  );
  await picture(page, "accounts-trend-no-spending-desktop", { full: true });
});

test("ACC-26: an account where every month is $0 has no trend", async ({ page }) => {
  await page.goto("/accounts");
  await picker(page).selectOption({ label: SAVINGS });
  await expect(page.getByText(`No Spending ${lastThreeMonths()}.`)).toBeVisible();

  await expect(trendCard(page)).toHaveCount(0);
  await expect(page.getByText("Monthly Spending")).toHaveCount(0);

  await shortcut(page, "All Months").click();
  await expect(shortcut(page, "All Months")).toHaveAttribute("aria-current", "page");
  await expect(trendCard(page)).toHaveCount(0);
});

test("ACC-27: Show Table lists the trend's months and figures", async ({ page }) => {
  await page.goto("/accounts");
  const card = trendCard(page);
  const labels = await trendMonths(page).evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label") ?? ""),
  );

  await card.getByRole("button", { name: "Show Table" }).click();
  const table = card.getByRole("table", { name: "Spending by month" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveText(["Month", "Spending"]);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(labels.length);
  for (const [index, label] of labels.entries()) {
    const [month, figure] = label.split(": spending ");
    await expect(rows.nth(index)).toHaveText(`${month}${figure}`);
  }

  await card.getByRole("button", { name: "Show Chart" }).click();
  await expect(table).toHaveCount(0);
  await expect(trendMonths(page)).toHaveCount(labels.length);

  await page.setViewportSize(PHONE);
  await card.getByRole("button", { name: "Show Table" }).click();
  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
});

test("ACC-28: a month whose rows all need review is a hollow point, not $0", async ({ page }) => {
  // Every row the seed gives Sandbox Girokonto needs review.
  await page.goto("/accounts");
  await picker(page).selectOption({ label: GIROKONTO });
  await expect(page.getByText(`Amounts are in EUR, ${lastThreeMonths()}.`)).toBeVisible();
  const card = trendCard(page);

  // Last 3 Months: the seed's empty month is €0.00, the two after it need review.
  await expect(trendMonth(page, -3)).toHaveAttribute(
    "aria-label",
    `${longMonth(-3)}: spending €0.00`,
  );
  for (const offset of [-2, -1]) {
    await expect(trendMonth(page, offset)).toHaveAttribute(
      "aria-label",
      `${longMonth(offset)}: spending needs review`,
    );
  }
  await expect(card.locator('[data-dot="missing"]')).toHaveCount(2);
  await expect(card.locator('[data-tag="missing"]')).toHaveText(["Needs Review", "Needs Review"]);
  // No line runs to them: the one month with a figure is a point on its own.
  for (const points of await card.locator("polyline").evaluateAll((lines) =>
    lines.map((line) => line.getAttribute("points") ?? ""),
  )) {
    expect(points.split(" ")).toHaveLength(1);
  }

  // This Month: the month in progress is highlighted, and still a hollow point.
  await shortcut(page, "This Month").click();
  await expect(shortcut(page, "This Month")).toHaveAttribute("aria-current", "page");
  await expect(card.getByText(oneMonthHint(0))).toBeVisible();
  await expect(trendMonth(page, 0)).toHaveAttribute(
    "aria-label",
    `${longMonth(0)}: spending needs review`,
  );
  await expect(card.locator("[data-band]")).toBeVisible();
  await expect(card.locator('[data-dot="highlighted"]')).toHaveCount(0);
  await picture(page, "accounts-trend-needs-review-desktop", { full: true });

  await page.setViewportSize(PHONE);
  const short = monthAt(0).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  await expect(card.getByText(`${short} · Needs Review`, { exact: true })).toBeVisible();
  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-trend-needs-review-phone", { full: true });

  // The table says Needs Review, not €0.00.
  await card.getByRole("button", { name: "Show Table" }).click();
  await expect(
    card.getByRole("table", { name: "Spending by month" }).getByRole("row", {
      name: new RegExp(`^${longMonth(0)} Needs Review$`),
    }),
  ).toBeVisible();
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
  // Personal and needs review sit side by side under the line, and there are no merchants.
  const personal = sideLine(page, "Personal");
  const review = reviewLine(page);
  await expect(personal).toContainText("$0.00");
  expect((await personal.boundingBox())?.y).toBe((await review.boundingBox())?.y);
  await expect(
    page.getByText("No merchants to show, because there's no Spending in this period."),
  ).toBeVisible();
  await picture(page, "accounts-no-spending-desktop");

  await page.setViewportSize(PHONE);
  await expect(page.getByText(`No Spending ${lastThreeMonths()}.`)).toBeVisible();
  await expect(categoryList(page)).toHaveCount(0);
  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-no-spending-phone");
});

/**
 * One of the lines beside Spending. The page holds a desktop and a phone copy, one
 * of them hidden, so this names the shown one.
 */
function sideLine(page: Page, text: string | RegExp) {
  return page
    .locator("[data-side-lines] > div")
    .filter({ visible: true })
    .filter({ hasText: text });
}

function reviewLine(page: Page) {
  return sideLine(page, /rows? needs? review/);
}

function merchantTable(page: Page) {
  return page.getByRole("table", { name: "Top merchants" });
}

test("ACC-11: Top Merchants lists the card's merchants by total, with visits", async ({
  page,
}) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "Top Merchants" })).toBeVisible();
  await expect(
    page.getByText("Each merchant is named by the bank text of its latest row."),
  ).toBeVisible();

  const table = merchantTable(page);
  await expect(table.getByRole("columnheader")).toHaveText(["Rank", "Merchant", "Visits", "Total"]);
  const rows = table.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(10);

  // Ranked 1 onwards by total, largest first, each with its visits.
  const ranks = await rows.locator("td:nth-child(1)").allTextContents();
  expect(ranks).toEqual(Array.from({ length: count }, (_, index) => String(index + 1)));
  const totals = (await rows.locator("td:nth-child(4)").allTextContents()).map(cents);
  expect(totals).toEqual([...totals].sort((a, b) => b - a));
  for (const visits of await rows.locator("td:nth-child(3)").allTextContents()) {
    expect(visits).toMatch(/^[1-9][\d,]*$/);
  }

  // Named by bank text, with the rows no merchant key fits under No Merchant.
  await expect(table.getByRole("rowheader", { name: "SAMPLE STORAGE CO" })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "No Merchant" })).toHaveCount(1);
  // Personal and rows that need review never count.
  await expect(table.getByRole("rowheader", { name: "SAMPLE GIFT SHOP" })).toHaveCount(0);
  await expect(table.getByRole("rowheader", { name: "SAMPLE TAQUERIA" })).toHaveCount(0);

  // Below Spending by Category.
  const card = await categoryTable(page).boundingBox();
  const merchants = await table.boundingBox();
  expect(merchants?.y ?? 0).toBeGreaterThan(card?.y ?? 0);
  await picture(page, "accounts-merchants-desktop", { full: true });
});

test("ACC-11: Top Merchants on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/accounts");

  const items = page.getByRole("list", { name: "Top merchants" }).getByRole("listitem");
  await expect(items.first()).toBeVisible();
  for (const text of await items.allTextContents()) {
    expect(text).toMatch(/\$[\d,]+\.\d{2}(1 visit|[\d,]+ visits)$/);
  }
  await expect(items.filter({ hasText: /^No Merchant/ })).toHaveCount(1);

  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-merchants-phone", { full: true });
});

test("ACC-12: Personal and the needs-review line, which opens the Review Inbox", async ({
  page,
}) => {
  await page.goto("/accounts");

  const personal = sideLine(page, "Personal");
  await expect(personal).toContainText(/^Personal\$[\d,]+\.\d{2}Personal rows aren't in Spending\.$/);
  await expect(personal).not.toContainText("$0.00");
  // Personal is never a category.
  await expect(categoryTable(page).getByRole("rowheader", { name: "Personal" })).toHaveCount(0);

  const link = page.getByRole("link", { name: /^[\d,]+ rows? needs? review and (aren't|isn't) in these totals\.$/ });
  await expect(link).toBeVisible();

  // Under the donut, beside the list.
  const chart = await donut(page).boundingBox();
  const line = await personal.boundingBox();
  const list = await categoryTable(page).boundingBox();
  expect(line?.y ?? 0).toBeGreaterThan((chart?.y ?? 0) + (chart?.height ?? 0));
  expect((line?.x ?? 0) + (line?.width ?? 0)).toBeLessThan(list?.x ?? 0);

  await link.click();
  await expect(page).toHaveURL(/\/review$/);
});

test("ACC-12: Personal and needs review follow the list on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/accounts");

  const personal = sideLine(page, "Personal");
  const list = await categoryList(page).boundingBox();
  const line = await personal.boundingBox();
  expect(line?.y ?? 0).toBeGreaterThan((list?.y ?? 0) + (list?.height ?? 0));
  const merchants = await page.getByRole("heading", { name: "Top Merchants" }).boundingBox();
  expect(merchants?.y ?? 0).toBeGreaterThan(line?.y ?? 0);
  await expect(reviewLine(page).getByRole("link")).toBeVisible();

  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
});

test("ACC-13: a period where every row needs review explains the empty donut", async ({
  page,
}) => {
  await page.goto("/accounts");
  await picker(page).selectOption({ label: GIROKONTO });

  await expect(page.getByRole("heading", { name: ALL_NEED_REVIEW })).toBeVisible();
  await expect(
    page.getByText(
      /^[\d,]+ rows? needs? review, so there's no Spending to show yet\. (They count|It counts) here once (they're|it's) decided\.$/,
    ),
  ).toBeVisible();
  await expect(donut(page)).toHaveCount(0);
  await expect(categoryTable(page)).toHaveCount(0);
  await expect(page.getByText(`No Spending ${lastThreeMonths()}.`)).toHaveCount(0);
  await expect(page.getByText(/^Change is against/)).toHaveCount(0);
  // The panel is the needs-review line, so only Personal is left beside it.
  await expect(sideLine(page, "Personal")).toContainText("€0.00");
  await expect(reviewLine(page)).toHaveCount(0);
  await expect(
    page.getByText("No merchants to show, because there's no Spending in this period."),
  ).toBeVisible();
  await picture(page, "accounts-all-need-review-desktop", { full: true });

  await page.setViewportSize(PHONE);
  await expect(page.getByRole("heading", { name: ALL_NEED_REVIEW })).toBeVisible();
  await expect(sideLine(page, "Personal")).toBeVisible();
  expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  await picture(page, "accounts-all-need-review-phone", { full: true });

  await page.getByRole("link", { name: "Go to Review Inbox" }).click();
  await expect(page).toHaveURL(/\/review$/);
});
