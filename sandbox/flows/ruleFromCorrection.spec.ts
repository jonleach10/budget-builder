import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * A rule from a correction, through the real screen. The sandbox's PARCELPOINT
 * card rows each carry a code that changes with each purchase, so each is its
 * own merchant group. Each test undoes its rule, so the rows are back after it.
 */
test.describe.configure({ mode: "serial" });

const PARCEL = "PARCELPOINT MKTPL\\*";

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
  await page.screenshot({ path: join(folder, `${name}.png`), animations: "disabled" });
}

async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

const groupButtons = (page: Page) =>
  page
    .getByRole("region", { name: "Merchants" })
    .getByRole("button", { name: new RegExp(`^${PARCEL}`) });

const notice = (page: Page) => page.getByRole("status");

/** Accepts the first PARCELPOINT group as Shopping, which offers a rule. */
async function acceptFirstParcel(page: Page): Promise<void> {
  await groupButtons(page).first().click();
  await page
    .getByRole("region", { name: "Merchants" })
    .getByLabel("Category")
    .selectOption({ label: "Shopping" });
  await page.getByRole("button", { name: /^Accept \d+ Rows?$/ }).click();
  await expect(notice(page)).toContainText(
    "saved for 1 row. Add a rule so future imports do the same?",
  );
}

/** Opens Add Rule, shortens the value, and gives the count it shows. */
async function shortenRule(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Add Rule..." }).click();
  const dialog = page.getByRole("dialog", { name: "Add Rule" });
  const value = dialog.getByLabel("Value");

  await expect(value).toHaveValue(new RegExp(`^${PARCEL}Q\\d{2}[0-9A-Z]{2}$`));
  await expect(
    dialog.getByText("Shorten the text so later purchases match. Case doesn't matter."),
  ).toBeVisible();
  await expect(dialog.getByText("No other rows in review match this rule.")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);

  await value.fill("PARCELPOINT MKTPL");
  const box = dialog.getByRole("checkbox", { name: /^Also sort \d+ rows? in review$/ });
  await expect(box).toBeVisible();
  await expect(box).not.toBeChecked();
  // Each code makes its own group, so the count names groups, not merchants.
  await expect(dialog).toContainText(/From \d+ merchant groups?, all in US accounts\./);
  const label = (await box.getAttribute("id")) ?? "";
  const text = await dialog.locator(`label[for="${label}"]`).textContent();
  return Number(text?.match(/\d+/)?.[0]);
}

test("a code in the text offers a rule, which sorts the rest and can be undone", async ({ page }) => {
  await page.goto("/review");
  const before = await rowsLeft(page);
  const parcels = await groupButtons(page).count();
  expect(parcels).toBeGreaterThan(1);

  await acceptFirstParcel(page);
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  await picture(page, "rule-offer-laptop");

  const count = await shortenRule(page);
  expect(count).toBe(parcels - 1);
  const dialog = page.getByRole("dialog", { name: "Add Rule" });
  await dialog.getByRole("button", { name: "Show Rows" }).click();
  await expect(
    dialog.getByRole("list", { name: "Rows this rule sorts" }).getByRole("listitem"),
  ).toHaveCount(Math.min(count, 5));
  await dialog.getByRole("checkbox").check();
  await picture(page, "rule-dialog-laptop");

  await dialog.getByRole("button", { name: "Save Rule" }).click();
  await expect(dialog).toBeHidden();
  await expect(notice(page)).toContainText(
    `Rule saved. ${count} more rows were sorted as Shopping.`,
  );
  await expect(groupButtons(page)).toHaveCount(0);
  await expect.poll(() => rowsLeft(page)).toBe(before - 1 - count);
  await picture(page, "rule-saved-laptop");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(notice(page)).toContainText(
    `The rule was deleted, and ${count} rows are back in review.`,
  );
  await expect(groupButtons(page)).toHaveCount(count);

  await page.reload();
  expect(await rowsLeft(page)).toBe(before - 1);
  await page.goto("/rules");
  await expect(page.getByText("PARCELPOINT MKTPL", { exact: true })).toHaveCount(0);
});

test("Skip keeps the plain notice, and adds no rule", async ({ page }) => {
  await page.goto("/review");
  await acceptFirstParcel(page);

  await page.getByRole("button", { name: "Skip" }).click();

  await expect(notice(page)).toHaveText("1 row was saved.");
  await expect(page.getByRole("button", { name: "Add Rule..." })).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the offer, the dialog and the notice fit with no sideways scroll", async ({ page }) => {
    await page.goto("/review");
    await acceptFirstParcel(page);
    await notice(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await picture(page, "rule-offer-phone");

    const count = await shortenRule(page);
    const dialog = page.getByRole("dialog", { name: "Add Rule" });
    await dialog.getByRole("checkbox").check();
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await picture(page, "rule-dialog-phone");

    // Each row shows its date, bank text, account and amount, even on a phone.
    await dialog.getByRole("button", { name: "Show Rows" }).click();
    const shown = dialog.getByRole("list", { name: "Rows this rule sorts" });
    const first = shown.getByRole("listitem").first();
    const visible = (text: RegExp) => first.locator("span:visible", { hasText: text });
    await expect(visible(/^[A-Z][a-z]{2} \d{1,2}$/)).toHaveCount(1);
    await expect(visible(new RegExp(`^${PARCEL}Q\\d{2}[0-9A-Z]{2}$`))).toHaveCount(1);
    await expect(visible(/^Sandbox Card$/)).toHaveCount(1);
    await expect(visible(/^-\$\d+\.\d{2}$/)).toHaveCount(1);
    await shown.evaluate((el) => el.scrollIntoView({ block: "center" }));
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await picture(page, "rule-show-rows-phone");

    await dialog.getByRole("button", { name: "Save Rule" }).click();
    await expect(notice(page)).toContainText(
      `Rule saved. ${count} more rows were sorted as Shopping.`,
    );
    await notice(page).evaluate((el) => el.scrollIntoView({ block: "start" }));
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    await picture(page, "rule-saved-phone");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(notice(page)).toContainText("The rule was deleted");
  });
});

const textRules = (page: Page) => page.getByRole("table", { name: "Text Rules" });

// Last in the file: its stored rule decides every PARCELPOINT row from here on.
test("Edit Earlier Rule edits the earlier rule as stored, and adds none", async ({ page }) => {
  // A stored rule that decides every PARCELPOINT row first.
  await page.goto("/rules");
  await page.getByRole("button", { name: "Add Rule", exact: true }).first().click();
  const add = page.getByRole("dialog", { name: "Add Rule" });
  await add.getByLabel("Value").fill("PARCELPOINT");
  await add.getByLabel("Type").selectOption("spending");
  await add.getByLabel("Category").selectOption({ label: "Shopping" });
  await add.getByRole("button", { name: "Save Rule" }).click();
  await expect(add).toBeHidden();
  // Counted once the list shows the new rule, so the count includes it.
  await expect(textRules(page).getByRole("cell", { name: "PARCELPOINT", exact: true })).toHaveCount(1);
  const rulesBefore = await textRules(page).getByRole("row").count();

  // Accept one PARCELPOINT group, which offers a rule with the full text.
  await page.goto("/review");
  await acceptFirstParcel(page);
  await page.getByRole("button", { name: "Add Rule..." }).click();

  const offered = page.getByRole("dialog", { name: "Add Rule" });
  await expect(offered).toContainText("An earlier rule matches this row first");
  await expect(offered.getByRole("button", { name: "Save Rule" })).toBeDisabled();
  await offered.getByRole("button", { name: "Edit Earlier Rule" }).click();

  const edit = page.getByRole("dialog", { name: "Edit Rule" });
  await expect(edit).toBeVisible();
  // The earlier rule is "Starts With PARCELPOINT", so that's what it should hold.
  await expect(edit.getByLabel("Value")).toHaveValue("PARCELPOINT");
  await expect(edit.getByLabel("Match")).toHaveValue("descriptionStartsWith");
  await expect(edit.getByLabel("Category").locator("option:checked")).toHaveText("Shopping");

  await edit.getByRole("button", { name: "Save Rule" }).click();
  await expect(edit).toBeHidden();

  await page.goto("/rules");
  await expect(textRules(page).getByRole("cell", { name: "PARCELPOINT", exact: true })).toHaveCount(1);
  await expect(textRules(page).getByRole("cell", { name: /^PARCELPOINT MKTPL/ })).toHaveCount(0);
  expect(await textRules(page).getByRole("row").count()).toBe(rulesBefore);
});
