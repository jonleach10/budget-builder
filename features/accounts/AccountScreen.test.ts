import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountScreenData, ReadyAccount } from "./accountScreenData";
import { AccountScreen } from "./AccountScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const PICKER = {
  selected: "acc-card",
  options: [
    { id: "acc-card", label: "Sample Card · Ending 2222" },
    { id: "acc-giro", label: "Sample Girokonto · Ending 3333" },
  ],
};

const READY: ReadyAccount = {
  status: "ready",
  picker: PICKER,
  subtitle: "Amounts are in USD, from August 1 to October 31, 2026.",
  categories: [
    { name: "Gas", amount: "$500.00", share: "50%" },
    { name: "Groceries", amount: "$500.00", share: "50%" },
  ],
  total: { amount: "$1,000.00", share: "100%" },
};

function render(screen: AccountScreenData | null): string {
  return renderToStaticMarkup(createElement(AccountScreen, { screen }));
}

describe("AccountScreen", () => {
  it("is titled Accounts, with the period in the subtitle", () => {
    const html = render(READY);

    expect(html).toContain(">Accounts</h1>");
    expect(html).toContain(
      "Amounts are in USD, from August 1 to October 31, 2026.",
    );
  });

  it("lists every account in the picker, with the shown one selected", () => {
    const html = render(READY);

    expect(html).toMatch(/<select[^>]*aria-label="Account"/);
    expect(html).toContain(
      '<option value="acc-card" selected="">Sample Card · Ending 2222</option>',
    );
    expect(html).toContain(
      '<option value="acc-giro">Sample Girokonto · Ending 3333</option>',
    );
  });

  it("lists each category with its amount and share, then the total", () => {
    const html = render(READY);

    expect(html).toContain("Spending by Category");
    expect(html).toMatch(/Gas<\/th>.*?\$500\.00.*?50%/);
    expect(html).toMatch(/Total<\/th>.*?\$1,000\.00.*?100%/);
  });

  it("points an account with no rows to Import, with no category list", () => {
    const html = render({
      status: "empty",
      picker: PICKER,
      subtitle: "Amounts are in EUR.",
      title: "No rows in Sample Girokonto",
      text: "Import a statement for this account to see its spending.",
    });

    expect(html).toContain("No rows in Sample Girokonto");
    expect(html).toMatch(/href="\/import"[^>]*>Go to Import</);
    expect(html).not.toContain("Spending by Category");
    expect(html).toMatch(/<select[^>]*aria-label="Account"/);
  });

  it("says when the page can't be loaded", () => {
    expect(render(null)).toContain(
      "This account can&#x27;t be loaded. Reload the page to try again.",
    );
  });
});
