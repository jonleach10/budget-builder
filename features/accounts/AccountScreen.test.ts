import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  AccountScreenData,
  CategoryLine,
  ReadyAccount,
} from "./accountScreenData";
import { AccountScreen } from "./AccountScreen";
import { layoutDonut, type SliceColor } from "./donutLayout";

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

function line(
  name: string,
  amount: string,
  share: string,
  change: string | null,
  swatch: SliceColor | null,
): CategoryLine {
  return {
    key: `category:${name}`,
    name,
    amount,
    share,
    change,
    dropped: false,
    swatch,
    members: [],
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
  chart: {
    layout: layoutDonut({
      slices: [
        { key: "category:Gas", minor: 50000, share: "50%", color: 1 },
        { key: "category:Groceries", minor: 50000, share: "50%", color: 2 },
      ],
      total: "$1,000.00",
    }),
    label: "Spending by category, $1,000.00 in all. The list gives every figure.",
  },
  noSpending: null,
  categories: [
    line("Gas", "$500.00", "50%", "+4%", 1),
    line("Groceries", "$500.00", "50%", "New", 2),
    { ...line("Travel", "$0.00", "0%", "-100%", null), dropped: true },
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
      /<tr data-dropped="true" class="[^"]*text-muted-foreground[^"]*"><th[^>]*>(?:(?!<\/th>).)*Travel<\/th>.*?\$0\.00.*?0%.*?-100%/,
    );
    expect(html.indexOf(">Travel<")).toBeGreaterThan(html.indexOf(">Groceries<"));
    // Its swatch is empty, because it has no slice.
    expect(html).toMatch(/ring-inset"><\/span><\/span>Travel<\/th>/);
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

  it("shows the donut as one image, named with its middle figure", () => {
    const html = render(READY);

    expect(html).toMatch(
      /<svg role="img" aria-label="Spending by category, \$1,000\.00 in all\. The list gives every figure\."/,
    );
    expect(html).toContain(">$1,000.00</text>");
  });

  it("lists Other's categories under it, each saying it's part of Other", () => {
    const html = render({
      ...READY,
      categories: [
        line("Gas", "$500.00", "50%", "+4%", 1),
        {
          ...line("Other", "$500.00", "50%", "-4%", "other"),
          key: "other",
          members: [
            { name: "Home", amount: "$312.00", share: "31%", change: "-22%" },
            { name: "Insurance", amount: "$188.00", share: "19%", change: "New" },
          ],
        },
      ],
    });

    expect(html).toMatch(/Other<\/th>.*?\$500\.00.*?50%.*?-4%/);
    expect(html).toMatch(
      /<tr data-member="true".*?Other: <\/span>Home<\/span><\/th>.*?\$312\.00.*?31%.*?-22%/,
    );
    expect(html.indexOf(">Home<")).toBeGreaterThan(html.indexOf(">Other<"));
    expect(html.indexOf(">Insurance<")).toBeLessThan(html.indexOf(">Total<"));
    // The phone list nests them in Other's item.
    expect(html).toContain('<ul aria-label="In Other">');
  });

  it("shows the no-Spending line in place of the donut and the list", () => {
    const html = render({
      ...READY,
      chart: null,
      noSpending: {
        title: "No Spending from August 1 to October 31, 2026.",
        text: "Only Spending rows count here, so transfers and income aren't shown.",
      },
      categories: [],
      total: { amount: "$0.00", share: "0%", change: "0%" },
    });

    expect(html).toContain("Spending by Category");
    expect(html).toContain("No Spending from August 1 to October 31, 2026.");
    expect(html).not.toContain("<svg role=\"img\"");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Change is against");
  });

  it("keeps the list beside the no-Spending line when a category dropped to zero", () => {
    const html = render({
      ...READY,
      chart: null,
      noSpending: { title: "No Spending for October 2026.", text: "Why." },
      categories: [{ ...line("Travel", "$0.00", "0%", "-100%", null), dropped: true }],
      total: { amount: "$0.00", share: "0%", change: "-100%" },
    });

    expect(html).toContain("No Spending for October 2026.");
    expect(html).toMatch(/Travel<\/th>.*?-100%/);
  });

  it("says when the page can't be loaded", () => {
    expect(render(null)).toContain(
      "This account can&#x27;t be loaded. Reload the page to try again.",
    );
  });
});
