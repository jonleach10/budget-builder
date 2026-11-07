import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** The seed labels last month's newest SAMPLE GROCER row, in Groceries. */
const LABEL = "Weekly shop";

function lastMonth(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  return start.toISOString().slice(0, 7);
}

/** A category's rows only show after a click, so sandbox:shot can't reach them. */
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

async function openGroceries(page: Page): Promise<void> {
  await page.goto(`/budget?month=${lastMonth()}&view=us`);
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
  // The other layout's button is in the page too, hidden, so this names the shown one.
  await page.getByRole("button", { name: "Groceries transactions" }).click();
}

test("a labeled row shows its label, with the bank text under it", async ({ page }) => {
  await openGroceries(page);

  const row = page
    .getByRole("table", { name: "Groceries transactions" })
    .getByRole("row")
    .filter({ hasText: LABEL });
  await expect(row).toHaveCount(1);
  await expect(row.getByText(LABEL, { exact: true })).toBeVisible();
  await expect(row.getByText(/^SAMPLE GROCER/)).toBeVisible();

  await row.scrollIntoViewIfNeeded();
  await picture(page, "budget-label-laptop");
});

test("a labeled row shows its label on a phone too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGroceries(page);

  // The category's list item holds its rows' items, so the last match is the row.
  const item = page.getByRole("listitem").filter({ hasText: LABEL }).last();
  await expect(item.getByText(LABEL, { exact: true })).toBeVisible();
  await expect(item.getByText(/^SAMPLE GROCER/)).toBeVisible();

  await item.scrollIntoViewIfNeeded();
  await picture(page, "budget-label-phone");
});

test("a row with no label shows the bank text alone", async ({ page }) => {
  await openGroceries(page);

  const plain = page
    .getByRole("table", { name: "Groceries transactions" })
    .locator("tbody tr")
    .filter({ hasNotText: LABEL })
    .first();
  await expect(plain).toBeVisible();
  // One line of text in the Description cell: no caption under it.
  await expect(plain.locator("td").nth(1).locator("div div")).toHaveCount(1);
});
