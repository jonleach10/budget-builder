import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountScreenData, ReadyAccount } from "./accountScreenData";
import { AccountScreen } from "./AccountScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const PICKER = {
  selected: "acc-card",
  options: [
    { id: "acc-card", label: "Sample Card · Ending 2222", href: "/accounts?account=acc-card" },
    { id: "acc-giro", label: "Sample Girokonto · Ending 3333", href: "/accounts?account=acc-giro" },
  ],
};

function monthSelect(selected: string) {
  return {
    selected,
    options: ["2026-08", "2026-09", "2026-10"].map((month) => ({
      month,
      label: `Month ${month}`,
      shortLabel: `Short ${month}`,
      href: `/accounts?account=acc-card&from=${month}&to=${month}`,
    })),
  };
}

const READY: ReadyAccount = {
  status: "ready",
  picker: PICKER,
  subtitle: "Amounts are in USD, from August 1 to October 31, 2026.",
  period: {
    shortcuts: [
      { label: "This Month", href: "/accounts?this", lit: false },
      { label: "Last 3 Months", href: "/accounts?last3", lit: true },
      { label: "Last 12 Months", href: "/accounts?last12", lit: false },
      { label: "All Months", href: "/accounts?all", lit: false },
    ],
    from: monthSelect("2026-08"),
    to: monthSelect("2026-10"),
  },
  hint: "Change is against May to July 2026, the 3 months before.",
  showChange: true,
  categories: [
    { name: "Gas", amount: "$500.00", share: "50%", change: "+4%", dropped: false },
    { name: "Groceries", amount: "$500.00", share: "50%", change: "New", dropped: false },
    { name: "Travel", amount: "$0.00", share: "0%", change: "-100%", dropped: true },
  ],
  total: { amount: "$1,000.00", share: "100%", change: "-3%" },
};

const ALL_MONTHS: ReadyAccount = {
  ...READY,
  hint: "All Months has no earlier period to compare with, so there's no Change column.",
  showChange: false,
  categories: READY.categories
    .filter(({ dropped }) => !dropped)
    .map((line) => ({ ...line, change: null })),
  total: { ...READY.total, change: null },
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

  it("offers the period shortcuts as links, with only the lit one marked current", () => {
    const html = render(READY);

    expect(html).toMatch(/<nav[^>]*aria-label="Period"/);
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/accounts\?last3">Last 3 Months</);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<select[^>]*aria-label="From"/);
    expect(html).toMatch(/<select[^>]*aria-label="To"/);
  });

  it("shows Change for each row and the total, and names what it's against", () => {
    const html = render(READY);

    expect(html).toContain("Change is against May to July 2026, the 3 months before.");
    expect(html).toMatch(/>Change<\/th>/);
    expect(html).toMatch(/Gas<\/th>.*?\$500\.00.*?50%.*?\+4%/);
    expect(html).toMatch(/Groceries<\/th>.*?New/);
    expect(html).toMatch(/Total<\/th>.*?\$1,000\.00.*?100%.*?-3%/);
    // The phone list puts share and change on one line.
    expect(html).toContain("50% · +4%");
  });

  it("mutes a category that dropped to zero, after the others", () => {
    const html = render(READY);

    expect(html).toMatch(
      /<tr data-dropped="true" class="[^"]*text-muted-foreground[^"]*"><th[^>]*>Travel<\/th>.*?\$0\.00.*?0%.*?-100%/,
    );
    expect(html.indexOf(">Travel<")).toBeGreaterThan(html.indexOf(">Groceries<"));
  });

  it("hides the Change column for All Months, and says why", () => {
    const html = render(ALL_MONTHS);

    expect(html).toContain(
      "All Months has no earlier period to compare with, so there&#x27;s no Change column.",
    );
    expect(html).not.toMatch(/>Change<\/th>/);
    expect(html).not.toContain("50% · ");
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
    expect(html).not.toContain('aria-label="Period"');
    expect(html).toMatch(/<select[^>]*aria-label="Account"/);
  });

  it("says when the page can't be loaded", () => {
    expect(render(null)).toContain(
      "This account can&#x27;t be loaded. Reload the page to try again.",
    );
  });
});
