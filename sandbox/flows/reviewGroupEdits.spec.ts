import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Edits inside an open merchant group. These use merchants no other flow does,
 * because every flow file runs on the same seeded rows.
 */
test.describe.configure({ mode: "serial" });

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

const merchants = (page: Page): Locator =>
  page.getByRole("region", { name: "Merchants" });

/** Every group's button, in the order the list shows them. */
const groupButtons = (page: Page): Locator =>
  merchants(page).locator("button[aria-expanded]");

const groupButton = (page: Page, name: string): Locator =>
  merchants(page).getByRole("button", { name: new RegExp(`^${name}`) });

async function placeOf(page: Page, name: string): Promise<number> {
  const names = await groupButtons(page).allInnerTexts();
  return names.findIndex((text) => text.startsWith(name));
}

/** The count the group's line shows at desktop width, such as 25 for "25 rows". */
async function countOf(page: Page, name: string): Promise<number> {
  const text = await groupButton(page, name).innerText();
  return Number(text.match(/(\d+) rows?/)?.[1]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Review Inbox" })).toBeVisible();
});

test("Save Row keeps the open group in its place, and the notice is about that row", async ({ page }) => {
  // An Accept first, so there's an earlier count in the notice.
  await groupButton(page, "INTEREST PAYMENT").click();
  await merchants(page).getByLabel("Type").selectOption({ label: "Income" });
  await page.getByRole("button", { name: /^Accept \d+ Rows?$/ }).click();
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  await expect(skip.or(page.getByText(/^\d+ rows? (was|were) saved\.$/))).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByRole("status")).toHaveText("3 rows were saved.");

  // Beispiel Apotheke ties Muster Markt, so one row fewer would sort it below.
  const name = "Beispiel Apotheke";
  await groupButton(page, name).click();
  await expect(groupButton(page, name)).toHaveAttribute("aria-expanded", "true");
  const place = await placeOf(page, name);
  const count = await countOf(page, name);
  const next = (await groupButtons(page).nth(place + 1).innerText()).split("\n")[0];
  expect(place).toBeGreaterThan(0);
  expect(await countOf(page, next)).toBe(count);

  const change = merchants(page).getByRole("button", { name: /^Change Beispiel Apotheke from/ });
  const date = (await change.first().getAttribute("aria-label"))?.replace(/^.* from /, "");
  await change.first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type").selectOption({ label: "Personal" });
  await dialog.getByRole("button", { name: "Save Row" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("status")).toHaveText(`The row from ${date} was saved.`);
  await expect(page.getByRole("status")).not.toContainText(/\d+ rows? (was|were) saved/);
  await expect.poll(() => countOf(page, name)).toBe(count - 1);
  await expect(groupButton(page, name)).toHaveAttribute("aria-expanded", "true");
  expect(await placeOf(page, name)).toBe(place);
  await picture(page, "review-save-row-keeps-place-laptop");

  // Closed, the group takes its place largest first, below the one it tied.
  await groupButton(page, name).click();
  await expect(groupButton(page, name)).toHaveAttribute("aria-expanded", "false");
  expect(await placeOf(page, name)).toBe(place + 1);
});

/** The months the seed fills, newest first, as Transactions' address takes them. */
function seededMonths(): string[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, back) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth() - back, 1))
      .toISOString()
      .slice(0, 7),
  );
}

test("Change All gives every row in the group one label, and Transactions shows it", async ({ page }) => {
  const name = "Muster Drogerie";
  await groupButton(page, name).click();
  const place = await placeOf(page, name);
  const count = await countOf(page, name);

  // One row gets its own label first, so Change All has one to replace.
  await merchants(page).getByRole("button", { name: /^Change Muster Drogerie from/ }).first().click();
  const editRow = page.getByRole("dialog");
  await editRow.getByLabel("Label", { exact: true }).fill("Old name");
  await editRow.getByRole("button", { name: "Save Row" }).click();
  await expect(editRow).toBeHidden();
  await expect(page.getByRole("status")).toHaveText(/^The row from .+ was saved\.$/);

  const changeAll = merchants(page).getByRole("button", { name: "Change All" });
  await expect(changeAll).toBeVisible();
  await changeAll.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Label All Rows" })).toBeVisible();
  const label = dialog.getByLabel("Label", { exact: true });
  await expect(label).toHaveAttribute("maxlength", "100");
  await expect(label).toHaveValue("");
  await expect(dialog).toContainText(
    "The label is blank, so saving clears the label on every row in this group.",
  );
  await expect(dialog.getByRole("button", { name: "Clear Labels" })).toBeEnabled();

  await label.fill("Drogerie sample");
  await expect(dialog).toContainText("1 row already has a different label. Saving replaces it.");
  await picture(page, "review-change-all-dialog-laptop");
  await dialog.getByRole("button", { name: "Save Label" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("status")).toHaveText(`The label was saved on ${count} rows.`);
  // The rows stay in review, so the group keeps its count, its place and stays open.
  await expect(groupButton(page, name)).toHaveAttribute("aria-expanded", "true");
  expect(await countOf(page, name)).toBe(count);
  expect(await placeOf(page, name)).toBe(place);
  const table = merchants(page).getByRole("table");
  await expect(table.getByRole("row").filter({ hasText: "Drogerie sample" })).toHaveCount(count);
  await groupButton(page, name).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await picture(page, "review-change-all-saved-laptop");

  let labeled = 0;
  for (const month of seededMonths()) {
    await page.goto(`/transactions?month=${month}`);
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    const rows = page.getByRole("row").filter({ hasText: name });
    const shown = await rows.count();
    await expect(rows.filter({ hasText: "Drogerie sample" })).toHaveCount(shown);
    await expect(rows.filter({ hasText: "Needs Review" })).toHaveCount(shown);
    labeled += shown;
  }
  expect(labeled).toBe(count);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Change All sits beside Accept, and its dialog fills the screen", async ({ page }) => {
    const name = "Beispiel Bäckerei";
    await groupButton(page, name).click();
    await expect(groupButton(page, name)).toHaveAttribute("aria-expanded", "true");

    const changeAll = merchants(page).getByRole("button", { name: "Change All" });
    const accept = merchants(page).getByRole("button", { name: /^Accept \d+ Rows?$/ });
    const [left, right] = [await changeAll.boundingBox(), await accept.boundingBox()];
    expect(left?.y).toBe(right?.y);
    expect((left?.x ?? 0) < (right?.x ?? 0)).toBe(true);
    await changeAll.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())?.width).toBe(390);
    await dialog.getByLabel("Label", { exact: true }).fill("Bakery sample");
    await picture(page, "review-change-all-dialog-phone");
    await dialog.getByRole("button", { name: "Save Label" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("status")).toHaveText(/^The label was saved on \d+ rows\.$/);
    await expect(groupButton(page, name)).toHaveAttribute("aria-expanded", "true");
    const list = merchants(page).getByRole("list", { name: "Rows in this group" });
    await expect(list.getByText("Bakery sample").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await groupButton(page, name).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await picture(page, "review-change-all-saved-phone");
  });
});
