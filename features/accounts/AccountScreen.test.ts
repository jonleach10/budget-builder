import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  AccountScreenData,
  CategoryLine,
  MerchantLine,
  ReadyAccount,
} from "./accountScreenData";
import { layoutLineChart, type ChartValue } from "@/features/budget/lineChartLayout";
import { TrendTable } from "@/features/budget/TrendCard";
import { AccountScreen } from "./AccountScreen";
import { layoutDonut, type SliceColor } from "./donutLayout";
import type { SpendingTrend } from "./spendingTrend";

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
    href: `/transactions?category=${name}`,
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
    label: "Spending by category, $1,000.00 in all. The list shows every figure.",
  },
  noSpending: null,
  categories: [
    line("Gas", "$500.00", "50%", "+4%", 1),
    line("Groceries", "$500.00", "50%", "New", 2),
    { ...line("Travel", "$0.00", "0%", "-100%", null), dropped: true },
  ],
  total: { amount: "$1,000.00", share: "100%", change: "-3%" },
  allNeedReview: null,
  personal: "$286.50",
  review: { text: "4 rows need review and aren't in these totals.", href: "/review" },
  trend: null,
  merchants: {
    hint: "Each merchant is named by the bank text of its latest row.",
    lines: [
      merchant("1", "SAMPLE GROCER", "14", "$1,104.62"),
      { ...merchant("2", "No Merchant", "5", "$241.35"), key: "no-merchant", noMerchant: true },
      { ...merchant("3", "SAMPLE CAFE", "1", "$4.50"), visitsText: "1 visit" },
    ],
    empty: null,
  },
  transactions: "/transactions?month=2026-10&account=acc-card",
};

function merchant(rank: string, name: string, visits: string, total: string): MerchantLine {
  return {
    key: `merchant:${name}`,
    rank,
    name,
    noMerchant: false,
    visits,
    visitsText: `${visits} visits`,
    total,
  };
}

const NO_MERCHANTS = {
  hint: null,
  lines: [],
  empty: "No merchants to show, because there's no Spending in this period.",
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

const SHORT =["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

function spendingLine(values: ChartValue[]) {
  return [{ key: "spending", label: "Spending", color: "chart-2" as const, values }];
}

const THREE_MONTHS: SpendingTrend = {
  layout: layoutLineChart({
    columns: [
      { name: "August 2026", short: "Aug", year: "2026" },
      { name: "September 2026", short: "Sep" },
      { name: "October 2026", short: "Oct" },
    ],
    series: spendingLine([119720, 241230, 263050]),
    currency: "USD",
  }),
  hint: null,
};

const ONE_MONTH: SpendingTrend = {
  layout: layoutLineChart({
    columns: SHORT.map((short, index) => {
      const year = index < 2 ? "2025" : "2026";
      return {
        name: `Month ${index}`,
        short,
        ...(index === 0 || short === "Jan" ? { year } : {}),
      };
    }),
    series: spendingLine([...Array<number>(11).fill(200000), 263050]),
    currency: "USD",
    highlight: 11,
  }),
  hint: "One month has one point, so the chart shows the 12 months up to October 2026.",
};

const NEEDS_REVIEW: SpendingTrend = {
  layout: layoutLineChart({
    columns: [
      { name: "July 2026", short: "Jul" },
      { name: "August 2026", short: "Aug" },
      { name: "September 2026", short: "Sep" },
      { name: "October 2026", short: "Oct" },
      { name: "November 2026", short: "Nov" },
    ],
    series: spendingLine([100000, 120000, { missing: "Needs Review" }, 90000, 80000]),
    currency: "USD",
  }),
  hint: null,
};

/** September and November need review, and November is the highlighted month. */
const HIGHLIGHTED_REVIEW: SpendingTrend = {
  layout: layoutLineChart({
    columns: [
      { name: "September 2026", short: "Sep" },
      { name: "October 2026", short: "Oct" },
      { name: "November 2026", short: "Nov" },
    ],
    series: spendingLine([{ missing: "Needs Review" }, 90000, { missing: "Needs Review" }]),
    currency: "USD",
    highlight: 2,
  }),
  hint: "One month has one point, so the chart shows the 12 months up to November 2026.",
};

const OTHER: CategoryLine = {
  ...line("Other", "$500.00", "50%", "-4%", "other"),
  key: "other",
  href: null,
  members: [
    {
      name: "Home",
      amount: "$312.00",
      share: "31%",
      change: "-22%",
      href: "/transactions?category=Home",
    },
    {
      name: "Insurance",
      amount: "$188.00",
      share: "19%",
      change: "New",
      href: "/transactions?category=Insurance",
    },
  ],
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
    expect(html).toMatch(/Gas<\/a><\/th>.*?\$500\.00.*?50%/);
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
    expect(html).toMatch(/Gas<\/a><\/th>.*?\$500\.00.*?50%.*?\+4%/);
    expect(html).toMatch(/Groceries<\/a><\/th>.*?New/);
    expect(html).toMatch(/Total<\/th>.*?\$1,000\.00.*?100%.*?-3%/);
    // The phone list puts share and change on one line.
    expect(html).toContain("50% · +4%");
  });

  it("mutes a category that dropped to zero, after the others", () => {
    const html = render(READY);

    expect(html).toMatch(
      /<tr data-dropped="true" class="[^"]*text-muted-foreground[^"]*"><th[^>]*>(?:(?!<\/th>).)*Travel<\/a><\/th>.*?\$0\.00.*?0%.*?-100%/,
    );
    expect(html.indexOf(">Travel<")).toBeGreaterThan(html.indexOf(">Groceries<"));
    // Its swatch is empty, because it has no slice.
    expect(html).toMatch(/ring-inset"><\/span><\/span><a [^>]*>Travel<\/a><\/th>/);
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
      /<svg role="img" aria-label="Spending by category, \$1,000\.00 in all\. The list shows every figure\."/,
    );
    expect(html).toContain(">$1,000.00</text>");
  });

  it("lists Other's categories under it, each saying it's part of Other", () => {
    const html = render({
      ...READY,
      categories: [
        line("Gas", "$500.00", "50%", "+4%", 1),
        OTHER,
      ],
    });

    expect(html).toMatch(/Other<\/th>.*?\$500\.00.*?50%.*?-4%/);
    expect(html).toMatch(
      /<tr data-member="true".*?Other: <\/span>Home<\/a><\/span><\/th>.*?\$312\.00.*?31%.*?-22%/,
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
      merchants: NO_MERCHANTS,
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
    expect(html).toMatch(/Travel<\/a><\/th>.*?-100%/);
  });

  it("opens Transactions from a link at the foot of the page", () => {
    const html = render(READY);

    expect(html).toMatch(
      /<a [^>]*href="\/transactions\?month=2026-10&amp;account=acc-card"[^>]*>Open in Transactions<svg/,
    );
    expect(html.indexOf("Open in Transactions")).toBeGreaterThan(
      html.indexOf(">Total<"),
    );
  });

  it("has no Transactions link for an account with no rows", () => {
    const html = render({
      status: "empty",
      picker: PICKER,
      subtitle: "Amounts are in EUR.",
      title: "No rows in Sample Girokonto",
      text: "Import a statement for this account to see its spending.",
    });

    expect(html).not.toContain("Open in Transactions");
  });

  it("links each category row to its rows in Transactions, in the table and the phone list", () => {
    const html = render(READY);

    for (const name of ["Gas", "Groceries", "Travel"]) {
      expect(html.match(new RegExp(`<a [^>]*href="/transactions\\?category=${name}"[^>]*>${name}</a>`, "g"))).toHaveLength(2);
    }
  });

  it("links the categories under Other, but not Other itself", () => {
    const html = render({ ...READY, categories: [OTHER] });

    expect(html).not.toMatch(/>Other<\/a>/);
    // Each reads as part of Other, link included.
    expect(
      html.match(/<a [^>]*href="\/transactions\?category=Home"[^>]*><span class="sr-only">Other: <\/span>Home<\/a>/g),
    ).toHaveLength(2);
    expect(html).toContain('href="/transactions?category=Insurance"');
  });

  it("shows the Personal total and the needs-review line, linking to the Review inbox", () => {
    const html = render(READY);

    expect(html).toMatch(/Personal<\/span><span[^>]*>\$286\.50</);
    expect(html).toContain("Personal rows aren&#x27;t in Spending.");
    expect(html).toMatch(
      /<a[^>]*href="\/review"[^>]*>4 rows need review and aren&#x27;t in these totals\.<\/a>/,
    );
  });

  it("puts Personal and needs review under the donut on a desktop and after the card on a phone", () => {
    const html = render(READY);
    const desktop = html.indexOf('data-side-lines="desktop"');
    const phone = html.indexOf('data-side-lines="phone"');

    expect(desktop).toBeGreaterThan(html.indexOf("<svg role=\"img\""));
    expect(desktop).toBeLessThan(html.indexOf("<table"));
    expect(phone).toBeGreaterThan(html.indexOf("</section>"));
    expect(html).toMatch(/data-side-lines="desktop"[^>]*class="[^"]*hidden[^"]*md:flex/);
    expect(html).toMatch(/data-side-lines="phone"[^>]*class="[^"]*md:hidden/);
  });

  it("says when no rows need review, with no link", () => {
    const html = render({
      ...READY,
      review: { text: "No rows need review.", href: null },
    });

    expect(html).toContain("No rows need review.");
    expect(html).not.toContain('href="/review"');
  });

  it("lists the top merchants with their rank, visits and total", () => {
    const html = render(READY);

    expect(html).toMatch(/<h2[^>]*>Top Merchants<\/h2>/);
    expect(html).toContain("Each merchant is named by the bank text of its latest row.");
    expect(html).toMatch(/>Merchant<\/th>.*?>Visits<\/th>.*?>Total<\/th>/);
    expect(html).toMatch(/>1<\/td><th[^>]*>SAMPLE GROCER<\/th><td[^>]*>14<\/td><td[^>]*>\$1,104\.62</);
    // On a phone, the visits go on a second line, in words.
    expect(html).toMatch(/SAMPLE GROCER.*?\$1,104\.62.*?14 visits/);
    expect(html).toContain("1 visit<");
    expect(html.indexOf("Top Merchants")).toBeGreaterThan(html.indexOf("Spending by Category"));
  });

  it("mutes No Merchant like a missing value, in its place by total", () => {
    const html = render(READY);

    expect(html).toMatch(/<th[^>]*text-muted-foreground[^>]*>No Merchant<\/th>/);
    expect(html.indexOf(">No Merchant<")).toBeGreaterThan(html.indexOf(">SAMPLE GROCER<"));
    expect(html.indexOf(">No Merchant<")).toBeLessThan(html.indexOf(">SAMPLE CAFE<"));
  });

  it("says why there are no merchants, with no hint and no table", () => {
    const html = render({ ...READY, merchants: NO_MERCHANTS });

    expect(html).toContain("Top Merchants");
    expect(html).toContain(
      "No merchants to show, because there&#x27;s no Spending in this period.",
    );
    expect(html).not.toContain("Each merchant is named");
    expect(html).not.toContain(">Visits</th>");
  });

  it("shows the all-needs-review panel in place of the donut and the list", () => {
    const html = render({
      ...READY,
      chart: null,
      categories: [],
      total: { amount: "$0.00", share: "0%", change: "-100%" },
      allNeedReview: {
        title: "Every row in this period needs review",
        text: "23 rows need review, so there's no Spending to show yet. They count here once they're decided.",
        href: "/review",
      },
      personal: "$0.00",
      review: { text: "23 rows need review and aren't in these totals.", href: "/review" },
      merchants: NO_MERCHANTS,
    });

    expect(html).toMatch(/<h3[^>]*>Every row in this period needs review<\/h3>/);
    expect(html).toContain(
      "23 rows need review, so there&#x27;s no Spending to show yet. They count here once they&#x27;re decided.",
    );
    expect(html).toMatch(/<a[^>]*href="\/review"[^>]*>Go to Review Inbox<\/a>/);
    expect(html).not.toContain("<svg role=\"img\"");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Change is against");
    // The panel is the needs-review line, so Personal stays on its own.
    expect(html).not.toContain("aren&#x27;t in these totals.");
    expect(html).toMatch(/Personal<\/span><span[^>]*>\$0\.00</);
  });

  it("has no Monthly Spending card when there's no trend", () => {
    expect(render(READY)).not.toContain("Monthly Spending");
  });

  it("shows Monthly Spending under Spending by Category, as one line with no legend", () => {
    const html = render({ ...READY, trend: THREE_MONTHS });

    expect(html).toMatch(/<section aria-label="Monthly spending"/);
    expect(html).toContain(">Monthly Spending</h2>");
    expect(html.indexOf("Monthly Spending")).toBeGreaterThan(
      html.indexOf("Spending by Category"),
    );
    expect(html).toContain("Show Table");
    expect(html).toContain("stroke-chart-2");
    expect(html).not.toContain("Income and Spending");
    // The end label names the line, and nothing else does.
    expect(html.match(/>Spending<\/span>/g)).toHaveLength(1);
    expect(html).toContain('aria-label="September 2026: spending $2,412.30"');
    expect(html).not.toContain("data-band");
  });

  it("puts Monthly Spending between Spending by Category and Top Merchants", () => {
    const html = render({ ...READY, trend: THREE_MONTHS });
    const trend = html.indexOf(">Monthly Spending</h2>");

    expect(trend).toBeGreaterThan(html.indexOf("Spending by Category"));
    expect(trend).toBeLessThan(html.indexOf(">Top Merchants</h2>"));
  });

  it("highlights the month of a one-month period, and says why there are 12", () => {
    const html = render({ ...READY, trend: ONE_MONTH });

    expect(html).toContain(
      "One month has one point, so the chart shows the 12 months up to October 2026.",
    );
    expect(html).toContain('data-band="true"');
    expect(html).toContain('data-dot="highlighted"');
    expect(html).toMatch(/data-tag="figure"[^>]*>\$2,630\.50</);
    expect(html).toContain(">Oct $2,630.50<");
    expect(html).toMatch(/font-semibold text-ice-highlight">Oct</);
  });

  it("puts the year under the first month and under January", () => {
    const html = render({ ...READY, trend: ONE_MONTH });

    expect(html).toMatch(/>Nov<span[^>]*>2025<\/span>/);
    expect(html).toMatch(/>Jan<span[^>]*>2026<\/span>/);
    expect(html).not.toMatch(/>Feb<span/);
  });

  it("draws a month whose rows all need review as a hollow point, untagged unless highlighted", () => {
    const html = render({ ...READY, trend: NEEDS_REVIEW });

    expect(html).toContain('data-dot="missing"');
    expect(html).not.toContain("data-tag");
    expect(html).not.toContain(">Needs Review<");
    expect(html).toContain('aria-label="September 2026: spending needs review"');
    // Two lines, one each side of it.
    expect(html.match(/<polyline/g)).toHaveLength(2);
  });

  it("tags the highlighted month Needs Review when its rows all need review", () => {
    const html = render({ ...READY, trend: HIGHLIGHTED_REVIEW });

    expect(html.match(/data-dot="missing"/g)).toHaveLength(2);
    expect(html.match(/data-tag=/g)).toHaveLength(1);
    expect(html).toMatch(/data-tag="missing"[^>]*>Needs Review</);
    expect(html).toContain(">Nov · Needs Review<");
    expect(html).not.toContain(">Sep · Needs Review<");
  });

  it("says when the page can't be loaded", () => {
    expect(render(null)).toContain(
      "This account can&#x27;t be loaded. Reload the page to try again.",
    );
  });
});

describe("Monthly Spending as a table", () => {
  const html = renderToStaticMarkup(
    createElement(TrendTable, {
      layout: NEEDS_REVIEW.layout,
      caption: "Spending by month",
    }),
  );

  it("is named for what it holds", () => {
    expect(html).toContain('<caption class="sr-only">Spending by month</caption>');
  });

  it("says Needs Review for a month whose rows all need review, not $0.00", () => {
    expect(html).toMatch(/September 2026<\/th><td[^>]*>Needs Review<\/td>/);
    expect(html).not.toContain("$0.00");
  });
});
