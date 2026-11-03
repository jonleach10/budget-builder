import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/** Each test saves through the real form, then reloads to prove it was stored. */
test.describe.configure({ mode: "serial" });

function lastMonth(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  return start.toISOString().slice(0, 7);
}

const MONTH_PAGE = `/transactions?month=${lastMonth()}`;

const rows = (page: Page, ...texts: string[]): Locator =>
  texts.reduce(
    (found, hasText) => found.filter({ hasText }),
    page.getByRole("row"),
  );

const labelField = (dialog: Locator): Locator =>
  dialog.getByLabel("Label", { exact: true });

async function openEdit(row: Locator): Promise<Locator> {
  await row.first().getByRole("button", { name: /^Edit / }).click();
  const dialog = row.page().getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function saveRow(dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: "Save Row" }).click();
  await expect(dialog).toBeHidden();
}

async function rowCount(page: Page): Promise<number> {
  const subtitle = await page.getByText(/^\d+ rows? in /).textContent();
  return Number.parseInt(subtitle ?? "", 10);
}

/** Edit Row only shows after a click, so sandbox:shot can't reach it. */
async function picture(page: Page, name: string): Promise<void> {
  const folder = process.env.SANDBOX_SHOT_DIR ?? "sandbox/.shots";
  mkdirSync(folder, { recursive: true });
  // Next's dev badge floats over rows, and it isn't part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  // A dialog counts as visible while it's still fading in.
  await page.screenshot({
    path: join(folder, `${name}.png`),
    animations: "disabled",
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(MONTH_PAGE);
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
});

test("Edit Row stays closed until a row's Edit is used", async ({ page }) => {
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const dialog = await openEdit(rows(page, "SAMPLE TAQUERIA", "Needs Review"));
  await expect(labelField(dialog)).toHaveAttribute(
    "placeholder",
    "Corner Market",
  );
  await picture(page, "edit-row-laptop");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("choosing a category clears Needs Review, and it stays", async ({ page }) => {
  const dialog = await openEdit(rows(page, "SAMPLE TAQUERIA", "Needs Review"));

  await dialog.getByLabel("Category").selectOption({ label: "Dining" });
  await saveRow(dialog);

  await page.reload();
  await expect(rows(page, "SAMPLE TAQUERIA", "Dining")).toHaveCount(1);
});

test("moving a row away from spending clears its category", async ({ page }) => {
  const dialog = await openEdit(rows(page, "SAMPLE TAQUERIA", "Dining"));

  await dialog.getByLabel("Type").selectOption({ label: "Income" });
  await expect(dialog.getByLabel("Category")).toBeDisabled();
  await saveRow(dialog);

  await page.reload();
  await expect(rows(page, "SAMPLE TAQUERIA", "Dining")).toHaveCount(0);
  await expect(rows(page, "SAMPLE TAQUERIA", "Income")).toHaveCount(1);
});

test("a row can be a transfer with no pair", async ({ page }) => {
  const dialog = await openEdit(rows(page, "SAMPLE LAUNDRY", "Needs Review"));

  await dialog.getByLabel("Type").selectOption({ label: "Transfer" });
  await saveRow(dialog);

  await page.reload();
  const transfer = rows(page, "SAMPLE LAUNDRY", "Transfer");
  await expect(transfer).toHaveCount(1);
  await expect(transfer).not.toContainText("Paired");
});

test("a label shows first, is trimmed, and keeps the bank text", async ({ page }) => {
  const dialog = await openEdit(rows(page, "SAMPLE HARDWARE"));

  await labelField(dialog).fill("  Corner hardware  ");
  await saveRow(dialog);

  await page.reload();
  await expect(rows(page, "Corner hardware", "SAMPLE HARDWARE")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Edit Corner hardware" })).toBeVisible();
});

test("a hidden row leaves the list and comes back", async ({ page }) => {
  const before = await rowCount(page);

  const dialog = await openEdit(rows(page, "SAMPLE PARKING"));
  await dialog.getByLabel("Hide this row from totals").check();
  await saveRow(dialog);

  await page.reload();
  expect(await rowCount(page)).toBe(before - 1);

  await page.getByLabel("Show Hidden").check();
  const hidden = await openEdit(rows(page, "SAMPLE PARKING", "Hidden"));
  await hidden.getByLabel("Hide this row from totals").uncheck();
  await saveRow(hidden);

  await page.reload();
  expect(await rowCount(page)).toBe(before);
});

test("a paired row warns first, then breaks the pair on both rows", async ({ page }) => {
  const dialog = await openEdit(rows(page, "Online Transfer from", "Paired"));
  const warning = dialog.getByText("removes this row's pair");

  await dialog.getByLabel("Type").selectOption({ label: "Spending" });
  await expect(warning).toBeVisible();
  await expect(dialog.getByRole("status").getByText(/^-\$/)).toHaveCSS(
    "white-space",
    "nowrap",
  );
  await picture(page, "edit-row-pair-warning-laptop");
  await dialog.getByLabel("Type").selectOption({ label: "Transfer" });
  await expect(warning).toBeHidden();

  await dialog.getByLabel("Type").selectOption({ label: "Spending" });
  await saveRow(dialog);

  await page.reload();
  await expect(rows(page, "Online Transfer from", "Paired")).toHaveCount(0);
  await expect(rows(page, "Online Transfer to", "Paired")).toHaveCount(0);
  await expect(rows(page, "Online Transfer to", "Needs Review")).toHaveCount(1);
});

test("a failed save says so and changes nothing", async ({ page, context }) => {
  const dialog = await openEdit(rows(page, "SAMPLE PHARMACY"));
  await labelField(dialog).fill("Never saved");

  await context.setOffline(true);
  await dialog.getByRole("button", { name: "Save Row" }).click();
  await expect(dialog.getByText("can't be reached")).toBeVisible();
  await context.setOffline(false);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.reload();
  await expect(page.getByText("Never saved")).toHaveCount(0);
});

test("Edit Row fills a phone's screen and saves", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await page.getByRole("button", { name: /^Edit SAMPLE BOOKS/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())?.width).toBe(390);
  await picture(page, "edit-row-phone");

  await labelField(dialog).fill("Phone label");
  await saveRow(dialog);

  await page.reload();
  // The table stays in the page at phone width, hidden, so this names the cards.
  const cards = page.getByRole("region", { name: "Transactions" });
  await expect(cards.getByText("Phone label")).toBeVisible();
});
