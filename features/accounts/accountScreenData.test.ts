import { describe, expect, it } from "vitest";
import {
  buildAccountScreen,
  type AccountRecord,
  type AccountSource,
  type AccountTransactionRow,
  type ReadyAccount,
} from "./accountScreenData";
import { shortcutPeriod, type PeriodChoice } from "./period";

const TODAY = "2026-11-08";

function range(from: string, to: string): PeriodChoice {
  return { kind: "range", from, to };
}

const CARD: AccountRecord = {
  id: "acc-card",
  name: "Sample Card",
  last_four: "2222",
  country: "US",
  currency: "USD",
};

const SAVINGS: AccountRecord = {
  ...CARD,
  id: "acc-savings",
  name: "Sample Savings",
  last_four: "4444",
};

const GIROKONTO: AccountRecord = {
  id: "acc-giro",
  name: "Sample Girokonto",
  last_four: "3333",
  country: "DE",
  currency: "EUR",
};

const CATEGORIES = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
  { id: "cat-gas", name: "Gas", position: 2 },
  { id: "cat-clothing", name: "Clothing", position: 3 },
];

let nextId = 0;

/** A Spending row in Groceries on the card in September 2026, unless told otherwise. */
function row(extra: Partial<AccountTransactionRow> = {}): AccountTransactionRow {
  nextId += 1;
  return {
    id: `t${nextId}`,
    account_id: CARD.id,
    posted_on: "2026-09-10",
    amount_minor: -10000,
    currency: "USD",
    description: "SAMPLE GROCER",
    note: null,
    base_amount_minor: -10000,
    base_currency: "USD",
    type: "spending",
    category_id: "cat-groceries",
    hidden: false,
    ppd_id: null,
    ordering_party_id: null,
    ...extra,
  };
}

function source(extra: Partial<AccountSource> = {}): AccountSource {
  return {
    accounts: [CARD],
    accountId: CARD.id,
    rows: [],
    categories: CATEGORIES,
    period: shortcutPeriod("last-3-months", TODAY),
    today: TODAY,
    ...extra,
  };
}

function ready(extra: Partial<AccountSource> = {}): ReadyAccount {
  const screen = buildAccountScreen(source(extra));
  if (screen.status !== "ready") throw new Error("Expected a ready screen.");
  return screen;
}

describe("buildAccountScreen", () => {
  it("lists each category's Spending with its share, largest first", () => {
    const screen = ready({
      rows: [
        row({ amount_minor: -30000 }),
        row({ category_id: "cat-dining", amount_minor: -12500 }),
        row({ category_id: "cat-dining", amount_minor: -7500 }),
        row({ category_id: "cat-gas", amount_minor: -50000 }),
      ],
    });

    expect(
      screen.categories.map(({ name, amount, share }) => ({ name, amount, share })),
    ).toEqual([
      { name: "Gas", amount: "$500.00", share: "50%" },
      { name: "Groceries", amount: "$300.00", share: "30%" },
      { name: "Dining", amount: "$200.00", share: "20%" },
    ]);
    expect(screen.total).toMatchObject({ amount: "$1,000.00", share: "100%" });
  });

  it("counts only Spending rows with a category, and leaves hidden rows out", () => {
    const screen = ready({
      rows: [
        row({ amount_minor: -20000 }),
        row({ amount_minor: -99900, hidden: true }),
        row({ type: "personal", category_id: null, amount_minor: -4000 }),
        row({ type: "income", category_id: null, amount_minor: 500000 }),
        row({ type: "saved", category_id: null, amount_minor: -25000 }),
        // A card payment typed Transfer, on the card's side.
        row({ type: "transfer", category_id: null, amount_minor: 120000 }),
        // Rows that need review: no type, or Spending with no category.
        row({ type: null, category_id: null, amount_minor: -3000 }),
        row({ category_id: null, amount_minor: -7000 }),
      ],
    });

    expect(screen.categories).toEqual([
      expect.objectContaining({
        name: "Groceries",
        amount: "$200.00",
        share: "100%",
      }),
    ]);
    expect(screen.total.amount).toBe("$200.00");
  });

  it("leaves a card payment typed Transfer out of the checking account too", () => {
    const checking: AccountRecord = {
      ...CARD,
      id: "acc-checking",
      name: "Sample Checking",
      last_four: "1111",
    };
    const screen = ready({
      accounts: [CARD, checking],
      accountId: checking.id,
      rows: [
        row({ account_id: checking.id, amount_minor: -5000 }),
        row({
          account_id: checking.id,
          type: "transfer",
          category_id: null,
          amount_minor: -120000,
        }),
      ],
    });

    expect(screen.total.amount).toBe("$50.00");
  });

  it("lowers a category's Spending by its refunds", () => {
    const screen = ready({
      rows: [row({ amount_minor: -8000 }), row({ amount_minor: 1500 })],
    });

    expect(screen.categories[0].amount).toBe("$65.00");
  });

  it("covers Last 3 Months, the three full months before this one", () => {
    const screen = ready({
      today: "2026-11-08",
      rows: [
        row({ posted_on: "2026-07-31", amount_minor: -1000 }),
        row({ posted_on: "2026-08-01", amount_minor: -2000 }),
        row({ posted_on: "2026-10-31", amount_minor: -4000 }),
        row({ posted_on: "2026-11-01", amount_minor: -8000 }),
      ],
    });

    expect(screen.total.amount).toBe("$60.00");
    expect(screen.subtitle).toBe(
      "Amounts are in USD, from August 1 to October 31, 2026.",
    );
  });

  it("names both years when Last 3 Months crosses a new year", () => {
    const screen = ready({
      today: "2026-02-14",
      period: shortcutPeriod("last-3-months", "2026-02-14"),
      rows: [row({ posted_on: "2026-01-20" })],
    });

    expect(screen.subtitle).toBe(
      "Amounts are in USD, from November 1, 2025, to January 31, 2026.",
    );
  });

  it("shows a German account in its own EUR, with no conversion", () => {
    const screen = ready({
      accounts: [CARD, GIROKONTO],
      accountId: GIROKONTO.id,
      rows: [
        row({
          account_id: GIROKONTO.id,
          amount_minor: -4250,
          currency: "EUR",
          base_amount_minor: -4600,
        }),
      ],
    });

    expect(screen.subtitle).toBe(
      "Amounts are in EUR, from August 1 to October 31, 2026.",
    );
    expect(screen.total.amount).toBe("€42.50");
  });

  it("lists every account in the picker, by name, savings included", () => {
    const screen = buildAccountScreen(
      source({ accounts: [GIROKONTO, SAVINGS, CARD], accountId: SAVINGS.id }),
    );

    expect(screen.picker).toEqual({
      selected: SAVINGS.id,
      options: [
        expect.objectContaining({ id: CARD.id, label: "Sample Card · Ending 2222" }),
        expect.objectContaining({
          id: GIROKONTO.id,
          label: "Sample Girokonto · Ending 3333",
        }),
        expect.objectContaining({
          id: SAVINGS.id,
          label: "Sample Savings · Ending 4444",
        }),
      ],
    });
  });

  it("keeps the period when the picker opens another account", () => {
    const screen = buildAccountScreen(
      source({
        accounts: [CARD, GIROKONTO],
        period: range("2026-10", "2026-10"),
      }),
    );

    expect(screen.picker?.options.map(({ href }) => href)).toEqual([
      "/accounts?account=acc-card&from=2026-10&to=2026-10",
      "/accounts?account=acc-giro&from=2026-10&to=2026-10",
    ]);
  });

  it("keeps All Months when the picker opens another account", () => {
    const screen = buildAccountScreen(
      source({ accounts: [CARD, GIROKONTO], period: { kind: "all" } }),
    );

    expect(screen.picker?.options[1].href).toBe(
      "/accounts?account=acc-giro&period=all",
    );
  });

  it.each([
    ["no account is asked for", null],
    ["the account asked for isn't one of the owner's", "acc-gone"],
    // readAccountParams passes the cookie's ID on when the address has none.
    ["the last account viewed no longer exists", "1f0c2a9e-0000-4000-8000-000000000000"],
  ])("shows the first account when %s", (_, accountId) => {
    const screen = buildAccountScreen(
      source({ accounts: [SAVINGS, CARD], accountId }),
    );

    expect(screen.picker?.selected).toBe(CARD.id);
  });

  it("counts only the chosen account's rows", () => {
    const screen = ready({
      accounts: [CARD, SAVINGS],
      accountId: CARD.id,
      rows: [row(), row({ account_id: SAVINGS.id, amount_minor: -70000 })],
    });

    expect(screen.total.amount).toBe("$100.00");
  });

  it("breaks a tie by category position, then name", () => {
    const categories = [
      { id: "cat-b", name: "Bakery", position: 1 },
      { id: "cat-a", name: "Apples", position: 1 },
      { id: "cat-z", name: "Zoo", position: 0 },
    ];
    const screen = ready({
      categories,
      rows: [
        row({ category_id: "cat-b" }),
        row({ category_id: "cat-a" }),
        row({ category_id: "cat-z" }),
      ],
    });

    expect(screen.categories.map(({ name }) => name)).toEqual([
      "Zoo",
      "Apples",
      "Bakery",
    ]);
  });

  it("gives a share of 0% when the period has no Spending", () => {
    const screen = ready({ rows: [row({ posted_on: "2026-11-02" })] });

    expect(screen.categories).toEqual([]);
    expect(screen.total.amount).toBe("$0.00");
    expect(screen.total.share).toBe("0%");
  });

  it("points an account with no rows to Import, with no period", () => {
    const screen = buildAccountScreen(
      source({ accounts: [CARD, GIROKONTO], accountId: GIROKONTO.id }),
    );

    expect(screen).toEqual({
      status: "empty",
      picker: expect.objectContaining({ selected: GIROKONTO.id }),
      subtitle: "Amounts are in EUR.",
      title: "No rows in Sample Girokonto",
      text: "Import a statement for this account to see its spending.",
    });
  });

  it("doesn't call an account with only hidden rows empty", () => {
    const screen = buildAccountScreen(
      source({ rows: [row({ hidden: true })] }),
    );

    expect(screen.status).toBe("ready");
  });

  it("has no period control for an account with no rows", () => {
    const screen = buildAccountScreen(source());

    expect(screen.status).toBe("empty");
    expect(screen).not.toHaveProperty("period");
  });

  it("explains a screen with no accounts at all", () => {
    expect(buildAccountScreen(source({ accounts: [], accountId: null }))).toEqual({
      status: "no-accounts",
      picker: null,
      subtitle: "",
      title: "No accounts yet",
      text: "Each bank account shows here once it's added.",
    });
  });
});

/** Rows in March 2025, September 2026 and the month in progress, November 2026. */
const SPREAD = () => [
  row({ posted_on: "2025-03-04", amount_minor: -1000 }),
  row({ posted_on: "2026-09-10", amount_minor: -2000 }),
  row({ posted_on: "2026-11-02", amount_minor: -4000 }),
];

function lit(screen: ReadyAccount): string[] {
  return screen.period.shortcuts.filter((s) => s.lit).map((s) => s.label);
}

describe("buildAccountScreen: the period", () => {
  it("offers the four shortcuts, each a link, with Last 3 Months lit by default", () => {
    const screen = ready({ rows: SPREAD() });

    expect(screen.period.shortcuts).toEqual([
      {
        label: "This Month",
        href: "/accounts?account=acc-card&from=2026-11&to=2026-11",
        lit: false,
      },
      {
        label: "Last 3 Months",
        href: "/accounts?account=acc-card&from=2026-08&to=2026-10",
        lit: true,
      },
      {
        label: "Last 12 Months",
        href: "/accounts?account=acc-card&from=2025-11&to=2026-10",
        lit: false,
      },
      {
        label: "All Months",
        href: "/accounts?account=acc-card&period=all",
        lit: false,
      },
    ]);
    expect(screen.period.from.selected).toBe("2026-08");
    expect(screen.period.to.selected).toBe("2026-10");
  });

  it("covers This Month, the month in progress, up to today", () => {
    const screen = ready({
      rows: SPREAD(),
      period: shortcutPeriod("this-month", TODAY),
    });

    expect(lit(screen)).toEqual(["This Month"]);
    expect(screen.total.amount).toBe("$40.00");
    expect(screen.subtitle).toBe(
      "Amounts are in USD, from November 1 to November 8, 2026.",
    );
    expect(screen.hint).toBe("Change is against October 2026, the month before.");
  });

  it("covers Last 12 Months, the twelve full months before this one", () => {
    const screen = ready({
      rows: SPREAD(),
      period: shortcutPeriod("last-12-months", TODAY),
    });

    expect(lit(screen)).toEqual(["Last 12 Months"]);
    expect(screen.total.amount).toBe("$20.00");
    expect(screen.subtitle).toBe(
      "Amounts are in USD, from November 1, 2025, to October 31, 2026.",
    );
    expect(screen.hint).toBe(
      "Change is against November 2024 to October 2025, the 12 months before.",
    );
  });

  it("lights no shortcut for a range none of them matches", () => {
    const screen = ready({ rows: SPREAD(), period: range("2026-10", "2026-10") });

    expect(lit(screen)).toEqual([]);
    expect(screen.subtitle).toBe("Amounts are in USD, for October 2026.");
    expect(screen.hint).toBe(
      "Change is against September 2026, the month before.",
    );
  });

  it("names the 3 months before in the hint for Last 3 Months", () => {
    expect(ready({ rows: SPREAD() }).hint).toBe(
      "Change is against May to July 2026, the 3 months before.",
    );
  });

  it("lights a shortcut when a From and To range matches it", () => {
    const screen = ready({ rows: SPREAD(), period: range("2025-11", "2026-10") });

    expect(lit(screen)).toEqual(["Last 12 Months"]);
  });

  it("fills From and To with the first and last months with rows for All Months", () => {
    const screen = ready({ rows: SPREAD(), period: { kind: "all" } });

    expect(lit(screen)).toEqual(["All Months"]);
    expect(screen.period.from.selected).toBe("2025-03");
    expect(screen.period.to.selected).toBe("2026-11");
    expect(screen.total.amount).toBe("$70.00");
    expect(screen.subtitle).toBe(
      "Amounts are in USD, from March 1, 2025, to November 8, 2026.",
    );
  });

  it("ends All Months at the last month with rows, before the month in progress", () => {
    const screen = ready({
      rows: [row({ posted_on: "2026-06-10" }), row({ posted_on: "2026-09-10" })],
      period: { kind: "all" },
    });

    expect(screen.subtitle).toBe(
      "Amounts are in USD, from June 1 to September 30, 2026.",
    );
  });

  it("hides Change for All Months, and says why", () => {
    const screen = ready({ rows: SPREAD(), period: { kind: "all" } });

    expect(screen.showChange).toBe(false);
    expect(screen.hint).toBe(
      "All Months has no earlier period to compare with, so there's no Change column.",
    );
    expect(screen.categories.every(({ change }) => change === null)).toBe(true);
    expect(screen.total.change).toBeNull();
  });

  it("treats a From and To range that matches All Months as All Months", () => {
    const screen = ready({ rows: SPREAD(), period: range("2025-03", "2026-11") });

    expect(lit(screen)).toEqual(["All Months"]);
    expect(screen.showChange).toBe(false);
  });

  it("offers every month from the first with rows to this month in From and To", () => {
    const screen = ready({
      rows: [row({ posted_on: "2026-07-10" })],
      period: range("2026-08", "2026-10"),
    });

    expect(screen.period.from.options.map(({ month }) => month)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(screen.period.to.options.map(({ month }) => month)).toEqual(
      screen.period.from.options.map(({ month }) => month),
    );
    expect(screen.period.from.options[0]).toEqual({
      month: "2026-07",
      label: "July 2026",
      shortLabel: "Jul 2026",
      href: "/accounts?account=acc-card&from=2026-07&to=2026-10",
    });
  });

  it("moves To up when From is chosen after it, and From back when To is before it", () => {
    const screen = ready({
      rows: [row({ posted_on: "2026-07-10" })],
      period: range("2026-08", "2026-10"),
    });
    const from = screen.period.from.options.find((o) => o.month === "2026-11");
    const to = screen.period.to.options.find((o) => o.month === "2026-07");

    expect(from?.href).toBe("/accounts?account=acc-card&from=2026-11&to=2026-11");
    expect(to?.href).toBe("/accounts?account=acc-card&from=2026-07&to=2026-07");
  });

  it("changes every figure with the period", () => {
    const rows = [
      row({ posted_on: "2026-08-10", amount_minor: -1000 }),
      row({ posted_on: "2026-11-02", category_id: "cat-gas", amount_minor: -5000 }),
    ];

    const lastThree = ready({ rows });
    const thisMonth = ready({ rows, period: shortcutPeriod("this-month", TODAY) });

    expect(lastThree.categories.map(({ name }) => name)).toEqual(["Groceries"]);
    expect(lastThree.total.amount).toBe("$10.00");
    expect(thisMonth.categories.map(({ name }) => name)).toEqual(["Gas"]);
    expect(thisMonth.total.amount).toBe("$50.00");
  });

  it("still offers the months asked for when they're outside the account's rows", () => {
    const screen = ready({
      rows: [row({ posted_on: "2026-09-10" })],
      period: range("2024-01", "2024-02"),
    });

    expect(screen.period.from.options.map(({ month }) => month)).toEqual([
      "2024-01",
      "2024-02",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });
});

/** Spending in a category in a month, for the change tests. */
function spent(category: string, month: string, minor: number): AccountTransactionRow {
  return row({
    category_id: category,
    posted_on: `${month}-15`,
    amount_minor: -minor,
  });
}

function changes(screen: ReadyAccount) {
  return screen.categories.map(({ name, amount, share, change, dropped }) => ({
    name,
    amount,
    share,
    change,
    dropped,
  }));
}

describe("buildAccountScreen: change against the period before", () => {
  it("compares Last 3 Months with the 3 months before, as a percentage", () => {
    const screen = ready({
      rows: [
        // August to October, the period.
        spent("cat-groceries", "2026-08", 6000),
        spent("cat-groceries", "2026-10", 6000),
        spent("cat-dining", "2026-09", 8800),
        spent("cat-gas", "2026-10", 5000),
        // May to July, the period before.
        spent("cat-groceries", "2026-05", 10000),
        spent("cat-dining", "2026-07", 10000),
        spent("cat-gas", "2026-06", 5000),
        // April is before both, so it counts nowhere.
        spent("cat-gas", "2026-04", 90000),
      ],
    });

    expect(screen.showChange).toBe(true);
    expect(changes(screen)).toEqual([
      { name: "Groceries", amount: "$120.00", share: "47%", change: "+20%", dropped: false },
      { name: "Dining", amount: "$88.00", share: "34%", change: "-12%", dropped: false },
      { name: "Gas", amount: "$50.00", share: "19%", change: "0%", dropped: false },
    ]);
    expect(screen.total).toEqual({ amount: "$258.00", share: "100%", change: "+3%" });
  });

  it("compares one month with the month before", () => {
    const screen = ready({
      period: range("2026-10", "2026-10"),
      rows: [
        spent("cat-groceries", "2026-10", 15000),
        spent("cat-groceries", "2026-09", 10000),
        // August is two months back, so it isn't compared.
        spent("cat-groceries", "2026-08", 99900),
      ],
    });

    expect(screen.categories[0].change).toBe("+50%");
  });

  it("shows New for a category with no Spending in the period before", () => {
    const screen = ready({
      rows: [
        spent("cat-groceries", "2026-09", 10000),
        spent("cat-dining", "2026-09", 5000),
        spent("cat-groceries", "2026-06", 10000),
      ],
    });

    expect(changes(screen)).toEqual([
      expect.objectContaining({ name: "Groceries", change: "0%" }),
      expect.objectContaining({ name: "Dining", change: "New" }),
    ]);
  });

  it("lists a category that dropped to zero after the others, muted, at -100%", () => {
    const screen = ready({
      rows: [
        spent("cat-gas", "2026-09", 1000),
        spent("cat-groceries", "2026-09", 3000),
        spent("cat-dining", "2026-06", 41200),
        spent("cat-groceries", "2026-06", 3000),
      ],
    });

    expect(changes(screen)).toEqual([
      { name: "Groceries", amount: "$30.00", share: "75%", change: "0%", dropped: false },
      { name: "Gas", amount: "$10.00", share: "25%", change: "New", dropped: false },
      { name: "Dining", amount: "$0.00", share: "0%", change: "-100%", dropped: true },
    ]);
    // $40.00 against $442.00.
    expect(screen.total).toEqual({ amount: "$40.00", share: "100%", change: "-91%" });
  });

  it("lists categories that dropped to zero by what they were, largest first", () => {
    const screen = ready({
      rows: [
        spent("cat-groceries", "2026-09", 1000),
        spent("cat-gas", "2026-06", 1000),
        spent("cat-dining", "2026-06", 5000),
      ],
    });

    expect(screen.categories.map(({ name }) => name)).toEqual([
      "Groceries",
      "Dining",
      "Gas",
    ]);
  });

  it("shows a dropped category even when the period has no Spending at all", () => {
    const screen = ready({ rows: [spent("cat-dining", "2026-06", 5000)] });

    expect(changes(screen)).toEqual([
      { name: "Dining", amount: "$0.00", share: "0%", change: "-100%", dropped: true },
    ]);
    expect(screen.total).toEqual({ amount: "$0.00", share: "0%", change: "-100%" });
  });

  it("counts a category bought and returned in the period as dropped to zero", () => {
    const screen = ready({
      rows: [
        row({ posted_on: "2026-09-10", amount_minor: -5000 }),
        row({ category_id: "cat-clothing", posted_on: "2026-07-12", amount_minor: -12000 }),
        row({ category_id: "cat-clothing", posted_on: "2026-10-03", amount_minor: -8000 }),
        row({ category_id: "cat-clothing", posted_on: "2026-10-17", amount_minor: 8000 }),
      ],
    });

    expect(changes(screen)).toEqual([
      { name: "Groceries", amount: "$50.00", share: "100%", change: "New", dropped: false },
      { name: "Clothing", amount: "$0.00", share: "0%", change: "-100%", dropped: true },
    ]);
    // $50.00 against $120.00.
    expect(screen.total).toEqual({ amount: "$50.00", share: "100%", change: "-58%" });
  });

  it("counts a category refunded in the period as dropped, at its net refund", () => {
    const screen = ready({
      rows: [
        row({ posted_on: "2026-09-10", amount_minor: -5000 }),
        row({ category_id: "cat-clothing", posted_on: "2026-07-12", amount_minor: -8000 }),
        row({ category_id: "cat-clothing", posted_on: "2026-08-02", amount_minor: 8000 }),
      ],
    });

    // A share is of the donut, which holds only Spending above zero, so Groceries is
    // all of it. The refund outweighs the period's Spending, so the Total is below
    // zero and there's nothing for its share to be part of. The column still adds up.
    expect(changes(screen)).toEqual([
      { name: "Groceries", amount: "$50.00", share: "100%", change: "New", dropped: false },
      { name: "Clothing", amount: "-$80.00", share: "0%", change: "-100%", dropped: true },
    ]);
    // -$30.00 against $80.00 is -138%, but Change never goes below -100%.
    expect(screen.total).toEqual({ amount: "-$30.00", share: "0%", change: "-100%" });
    // The middle figure is the slices' sum, so here it isn't the Total.
    expect(screen.chart?.layout.middle.total.text).toBe("$50.00");
  });

  it("mutes a category with only refunds in the period, at New, and never makes it a slice", () => {
    const screen = ready({
      rows: [
        row({ posted_on: "2026-09-10", amount_minor: -5000 }),
        row({ category_id: "cat-clothing", posted_on: "2026-09-12", amount_minor: 2000 }),
      ],
    });

    expect(changes(screen)).toEqual([
      { name: "Groceries", amount: "$50.00", share: "100%", change: "New", dropped: false },
      { name: "Clothing", amount: "-$20.00", share: "0%", change: "New", dropped: true },
    ]);
    expect(screen.categories[1].swatch).toBeNull();
    expect(screen.chart?.layout.arcs.map(({ color }) => color)).toEqual([1]);
  });

  it("gives the total no change when neither period has Spending", () => {
    const screen = ready({ rows: [row({ posted_on: "2026-11-02" })] });

    expect(screen.total.change).toBe("0%");
  });

  it("counts only Spending that's decided in the period before, too", () => {
    const screen = ready({
      rows: [
        spent("cat-groceries", "2026-09", 10000),
        row({ posted_on: "2026-06-10", amount_minor: -10000, hidden: true }),
        row({ posted_on: "2026-06-10", amount_minor: -10000, category_id: null }),
        row({
          posted_on: "2026-06-10",
          amount_minor: -10000,
          type: "personal",
          category_id: null,
        }),
      ],
    });

    expect(screen.categories[0].change).toBe("New");
  });

  it("rounds a change that's close to zero to 0%, with no sign", () => {
    const screen = ready({
      rows: [
        spent("cat-groceries", "2026-09", 99800),
        spent("cat-groceries", "2026-06", 100000),
      ],
    });

    expect(screen.categories[0].change).toBe("0%");
  });
});

/** Nine categories, as on a busy card, by position. */
const NINE = [
  "Groceries",
  "Dining",
  "Shopping",
  "Entertainment",
  "Gas",
  "Health",
  "Home",
  "Insurance",
  "Clothing",
].map((name, position) => ({ id: `cat-${name.toLowerCase()}`, name, position }));

/** In September, adding up to $6,240.00. */
const NINE_SPENT: [string, number][] = [
  ["cat-groceries", 187240],
  ["cat-dining", 131015],
  ["cat-shopping", 99860],
  ["cat-entertainment", 62400],
  ["cat-gas", 49925],
  ["cat-health", 37440],
  ["cat-home", 31200],
  ["cat-insurance", 18720],
  ["cat-clothing", 6200],
];

function nine(extra: AccountTransactionRow[] = []): ReadyAccount {
  return ready({
    categories: NINE,
    rows: [
      ...NINE_SPENT.map(([category, minor]) => spent(category, "2026-09", minor)),
      ...extra,
    ],
  });
}

function legend(screen: ReadyAccount) {
  return screen.categories.map(({ name, amount, share, swatch }) => ({
    name,
    amount,
    share,
    swatch,
  }));
}

describe("buildAccountScreen: the donut", () => {
  it("gives the top 6 categories a slice each and groups the rest as Other", () => {
    const screen = nine();

    expect(legend(screen)).toEqual([
      { name: "Groceries", amount: "$1,872.40", share: "30%", swatch: 1 },
      { name: "Dining", amount: "$1,310.15", share: "21%", swatch: 2 },
      { name: "Shopping", amount: "$998.60", share: "16%", swatch: 3 },
      { name: "Entertainment", amount: "$624.00", share: "10%", swatch: 4 },
      { name: "Gas", amount: "$499.25", share: "8%", swatch: 5 },
      { name: "Health", amount: "$374.40", share: "6%", swatch: 6 },
      { name: "Other", amount: "$561.20", share: "9%", swatch: "other" },
    ]);
    expect(screen.chart?.layout.arcs.map(({ color }) => color)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      "other",
    ]);
  });

  it("lists Other's categories under it, with their amounts, shares and change", () => {
    const screen = nine([
      // May to July: Home was more, Insurance the same, Clothing had none.
      spent("cat-home", "2026-06", 40000),
      spent("cat-insurance", "2026-06", 18720),
      spent("cat-groceries", "2026-06", 187240),
    ]);
    const other = screen.categories.find(({ name }) => name === "Other");

    // $561.20 against $587.20.
    expect(other?.change).toBe("-4%");
    expect(other?.members).toEqual([
      { name: "Home", amount: "$312.00", share: "5%", change: "-22%" },
      { name: "Insurance", amount: "$187.20", share: "3%", change: "0%" },
      { name: "Clothing", amount: "$62.00", share: "1%", change: "New" },
    ]);
    expect(screen.categories[0].members).toEqual([]);
  });

  it("gives every slice a colour by its place, and hatches only Other", () => {
    const screen = nine();

    expect(screen.categories.map(({ swatch }) => swatch)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      "other",
    ]);
  });

  it("has no Other with exactly 7 categories, and gives the 7th a solid slot", () => {
    const screen = ready({
      categories: NINE,
      rows: NINE_SPENT.slice(0, 7).map(([category, minor]) =>
        spent(category, "2026-09", minor),
      ),
    });

    expect(screen.categories.map(({ name }) => name)).toEqual([
      "Groceries",
      "Dining",
      "Shopping",
      "Entertainment",
      "Gas",
      "Health",
      "Home",
    ]);
    expect(screen.categories.map(({ swatch }) => swatch)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(screen.categories.every(({ members }) => members.length === 0)).toBe(true);
  });

  it("orders tied categories by position, then name, across the edge of Other", () => {
    const categories = [
      { id: "cat-a", name: "Alpha", position: 3 },
      { id: "cat-b", name: "Bravo", position: 0 },
      { id: "cat-c", name: "Charlie", position: 5 },
      { id: "cat-d", name: "Delta", position: 1 },
      { id: "cat-e", name: "Echo", position: 4 },
      { id: "cat-f", name: "Foxtrot", position: 2 },
      // Golf and Hotel share a position, so the name decides.
      { id: "cat-h", name: "Hotel", position: 6 },
      { id: "cat-g", name: "Golf", position: 6 },
    ];
    const screen = ready({
      categories,
      rows: categories.map(({ id }) => spent(id, "2026-09", 1000)),
    });

    expect(screen.categories.map(({ name }) => name)).toEqual([
      "Bravo",
      "Delta",
      "Foxtrot",
      "Alpha",
      "Echo",
      "Charlie",
      "Other",
    ]);
    expect(screen.categories[6].members.map(({ name }) => name)).toEqual([
      "Golf",
      "Hotel",
    ]);
  });

  it("puts the sum of the slices in the middle, which is the Total", () => {
    const screen = nine();

    expect(screen.chart?.layout.middle.total.text).toBe("$6,240.00");
    expect(screen.total.amount).toBe("$6,240.00");
  });

  it("names the chart by its figure, and points to the list for the rest", () => {
    expect(nine().chart?.label).toBe(
      "Spending by category, $6,240.00 in all. The list shows every figure.",
    );
  });

  it("puts a muted category after Other and before Total, with no slice", () => {
    const withTravel = ready({
      categories: [...NINE, { id: "cat-travel", name: "Travel", position: 9 }],
      rows: [
        ...NINE_SPENT.map(([category, minor]) => spent(category, "2026-09", minor)),
        spent("cat-travel", "2026-06", 41200),
      ],
    });

    expect(withTravel.categories.map(({ name }) => name).slice(-2)).toEqual([
      "Other",
      "Travel",
    ]);
    expect(withTravel.categories.at(-1)).toMatchObject({
      dropped: true,
      swatch: null,
      members: [],
    });
    expect(withTravel.chart?.layout.arcs).toHaveLength(7);
  });

  it("shows no donut and says why when the period has no Spending", () => {
    const screen = ready({
      rows: [
        row({ type: "transfer", category_id: null, amount_minor: 25000 }),
        row({ type: "income", category_id: null, amount_minor: 1200 }),
      ],
    });

    expect(screen.chart).toBeNull();
    expect(screen.categories).toEqual([]);
    expect(screen.noSpending).toEqual({
      title: "No Spending from August 1 to October 31, 2026.",
      text: "Only Spending rows count here, so transfers and income aren't shown.",
    });
  });

  it("names a single month in the no-Spending line", () => {
    const screen = ready({
      period: range("2026-10", "2026-10"),
      rows: [row({ posted_on: "2026-10-05", type: "transfer", category_id: null })],
    });

    expect(screen.noSpending?.title).toBe("No Spending for October 2026.");
  });

  it("keeps a category that dropped to zero listed when the period has no Spending", () => {
    const screen = ready({ rows: [spent("cat-dining", "2026-06", 5000)] });

    expect(screen.chart).toBeNull();
    expect(screen.noSpending).not.toBeNull();
    expect(screen.categories.map(({ name, dropped }) => ({ name, dropped }))).toEqual([
      { name: "Dining", dropped: true },
    ]);
  });

  it("has no no-Spending line when there's a donut", () => {
    expect(nine().noSpending).toBeNull();
  });
});

/** A Personal row, which holds no category. */
function personal(extra: Partial<AccountTransactionRow> = {}): AccountTransactionRow {
  return row({ type: "personal", category_id: null, ...extra });
}

describe("buildAccountScreen: Personal", () => {
  it("totals the period's Personal rows, less their refunds, apart from Spending", () => {
    const screen = ready({
      rows: [
        row({ amount_minor: -10000 }),
        personal({ amount_minor: -25000 }),
        personal({ posted_on: "2026-10-30", amount_minor: -4650 }),
        personal({ amount_minor: 1000 }),
      ],
    });

    expect(screen.personal).toBe("$286.50");
    expect(screen.categories.map(({ name }) => name)).toEqual(["Groceries"]);
    expect(screen.total.amount).toBe("$100.00");
    expect(screen.chart?.layout.arcs).toHaveLength(1);
  });

  it("leaves hidden Personal rows and those outside the period out", () => {
    const screen = ready({
      rows: [
        personal({ amount_minor: -2000 }),
        personal({ amount_minor: -90000, hidden: true }),
        personal({ posted_on: "2026-07-31", amount_minor: -80000 }),
        personal({ posted_on: "2026-11-01", amount_minor: -70000 }),
      ],
    });

    expect(screen.personal).toBe("$20.00");
  });

  it("shows $0.00 when the period has no Personal rows", () => {
    expect(ready({ rows: [row()] }).personal).toBe("$0.00");
  });

  it("totals a German account's Personal rows in EUR", () => {
    const screen = ready({
      accounts: [GIROKONTO],
      accountId: GIROKONTO.id,
      rows: [personal({ account_id: GIROKONTO.id, currency: "EUR", amount_minor: -1250 })],
    });

    expect(screen.personal).toBe("€12.50");
  });
});

/** A row that needs review: Spending with no category, unless told otherwise. */
function waiting(extra: Partial<AccountTransactionRow> = {}): AccountTransactionRow {
  return row({ category_id: null, ...extra });
}

describe("buildAccountScreen: needs review", () => {
  it("counts the period's rows that need review and links to the Review inbox", () => {
    const screen = ready({
      rows: [
        row(),
        waiting(),
        waiting({ type: null, amount_minor: 120000 }),
        // A category ID that's no longer a category leaves the row with none.
        waiting({ category_id: "cat-gone" }),
        waiting({ type: "transfer", category_id: null }),
        waiting({ hidden: true }),
        waiting({ posted_on: "2026-07-31" }),
        waiting({ posted_on: "2026-11-01" }),
      ],
    });

    expect(screen.review).toEqual({
      text: "3 rows need review and aren't in these totals.",
      href: "/review",
    });
  });

  it("says one row in the singular", () => {
    expect(ready({ rows: [row(), waiting()] }).review.text).toBe(
      "1 row needs review and isn't in these totals.",
    );
  });

  it("says when no rows need review, with no link", () => {
    expect(ready({ rows: [row()] }).review).toEqual({
      text: "No rows need review.",
      href: null,
    });
  });

  it("has no all-needs-review state while some rows are decided", () => {
    const screen = ready({ rows: [waiting(), personal()] });

    expect(screen.allNeedReview).toBeNull();
    expect(screen.noSpending).not.toBeNull();
  });
});

describe("buildAccountScreen: every row needs review", () => {
  it("explains the empty donut in its place, linking to the Review inbox", () => {
    const screen = ready({
      rows: [
        waiting(),
        waiting({ type: null, amount_minor: 410000 }),
        waiting({ posted_on: "2026-10-02" }),
      ],
    });

    expect(screen.allNeedReview).toEqual({
      title: "Every row in this period needs review",
      text: "3 rows need review, so there's no Spending to show yet. They count here once they're decided.",
      href: "/review",
    });
    expect(screen.chart).toBeNull();
    expect(screen.noSpending).toBeNull();
    expect(screen.review.text).toBe("3 rows need review and aren't in these totals.");
    expect(screen.personal).toBe("$0.00");
  });

  it("says one row in the singular", () => {
    expect(ready({ rows: [waiting()] }).allNeedReview?.text).toBe(
      "1 row needs review, so there's no Spending to show yet. It counts here once it's decided.",
    );
  });

  it("lists no category, so Spending from the period before doesn't read as stopped", () => {
    const screen = ready({
      rows: [waiting(), spent("cat-dining", "2026-06", 5000)],
    });

    expect(screen.allNeedReview).not.toBeNull();
    expect(screen.categories).toEqual([]);
  });

  it("ignores hidden rows, which are out of every total", () => {
    const screen = ready({ rows: [waiting(), row({ hidden: true })] });

    expect(screen.allNeedReview).not.toBeNull();
  });

  it("counts only the period's rows", () => {
    const screen = ready({
      rows: [waiting(), row({ posted_on: "2026-11-02" }), row({ posted_on: "2026-07-02" })],
    });

    expect(screen.allNeedReview).not.toBeNull();
  });

  it("doesn't apply to a period with no rows at all", () => {
    const screen = ready({ rows: [waiting({ posted_on: "2026-11-02" })] });

    expect(screen.allNeedReview).toBeNull();
    expect(screen.noSpending).not.toBeNull();
  });
});

/** A Spending row at a merchant, by its bank text. */
function at(
  description: string,
  minor: number,
  extra: Partial<AccountTransactionRow> = {},
): AccountTransactionRow {
  return row({ description, amount_minor: -minor, ...extra });
}

function merchants(screen: ReadyAccount) {
  return screen.merchants.lines.map(({ rank, name, visits, total }) => ({
    rank,
    name,
    visits,
    total,
  }));
}

describe("buildAccountScreen: top merchants", () => {
  it("totals each merchant's Spending with its visits, largest first", () => {
    const screen = ready({
      rows: [
        at("SAMPLE CAFE", 450),
        at("SAMPLE GROCER", 6400),
        at("SAMPLE CAFE", 520),
        at("SAMPLE GROCER", 3100),
        at("SAMPLE CAFE", 610),
        at("SAMPLE FUEL", 4100),
      ],
    });

    expect(merchants(screen)).toEqual([
      { rank: "1", name: "SAMPLE GROCER", visits: "2", total: "$95.00" },
      { rank: "2", name: "SAMPLE FUEL", visits: "1", total: "$41.00" },
      { rank: "3", name: "SAMPLE CAFE", visits: "3", total: "$15.80" },
    ]);
    expect(screen.merchants.hint).toBe(
      "Each merchant is named by the bank text of its latest row.",
    );
    expect(screen.merchants.empty).toBeNull();
  });

  it("says each merchant's visits in words for a phone", () => {
    const screen = ready({ rows: [at("SAMPLE CAFE", 450), at("SAMPLE CAFE", 450), at("SAMPLE FUEL", 4100)] });

    expect(screen.merchants.lines.map(({ visitsText }) => visitsText)).toEqual([
      "1 visit",
      "2 visits",
    ]);
  });

  it("groups rows by merchant key, named by the bank text of the period's latest", () => {
    const screen = ready({
      rows: [
        // One PPD ID, so one merchant, whatever the text says.
        at("SAMPLE GYM 0042 SEP", 3000, { ppd_id: "PPD0001", posted_on: "2026-09-02" }),
        at("SAMPLE GYM 0057 OCT", 3000, { ppd_id: "PPD0001", posted_on: "2026-10-02" }),
        at("SAMPLE GYM 0031 AUG", 3000, { ppd_id: "PPD0001", posted_on: "2026-08-02" }),
        // Bank text keys ignore case, and the latest row's own text names it.
        at("Sample Bakery", 900, { posted_on: "2026-10-20" }),
        at("SAMPLE BAKERY", 900, { posted_on: "2026-09-20" }),
        // A later row outside the period doesn't name it.
        at("SAMPLE GYM 0078 NOV", 3000, { ppd_id: "PPD0001", posted_on: "2026-11-02" }),
      ],
    });

    expect(merchants(screen)).toEqual([
      { rank: "1", name: "SAMPLE GYM 0057 OCT", visits: "3", total: "$90.00" },
      { rank: "2", name: "Sample Bakery", visits: "2", total: "$18.00" },
    ]);
  });

  it("keeps an Ordering Party ID apart from the same text as bank text", () => {
    const screen = ready({
      rows: [
        at("MUSTER VERSICHERUNG", 4250, { ordering_party_id: "DE00ZZZ00001234567" }),
        at("MUSTER VERSICHERUNG", 1000),
      ],
    });

    expect(merchants(screen).map(({ name, visits }) => ({ name, visits }))).toEqual([
      { name: "MUSTER VERSICHERUNG", visits: "1" },
      { name: "MUSTER VERSICHERUNG", visits: "1" },
    ]);
  });

  it("groups rows with no merchant key under No Merchant, ranked like any merchant", () => {
    const screen = ready({
      rows: [
        at("", 5000),
        at("[REDACTED]", 4000),
        at("[REDACTED] / [REDACTED]", 3000),
        at("SAMPLE CAFE", 450),
      ],
    });

    expect(merchants(screen)).toEqual([
      { rank: "1", name: "No Merchant", visits: "3", total: "$120.00" },
      { rank: "2", name: "SAMPLE CAFE", visits: "1", total: "$4.50" },
    ]);
    expect(screen.merchants.lines.map(({ noMerchant }) => noMerchant)).toEqual([true, false]);
  });

  it("groups redacted bank text by the text left around the placeholder", () => {
    const screen = ready({
      rows: [
        at("SAMPLE PAY [REDACTED]", 2000, { posted_on: "2026-09-01" }),
        at("SAMPLE PAY [REDACTED] [REDACTED]", 2000, { posted_on: "2026-09-03" }),
        // Without a placeholder it's another key, so another merchant.
        at("SAMPLE PAY", 1000),
      ],
    });

    expect(merchants(screen)).toEqual([
      { rank: "1", name: "SAMPLE PAY [REDACTED] [REDACTED]", visits: "2", total: "$40.00" },
      { rank: "2", name: "SAMPLE PAY", visits: "1", total: "$10.00" },
    ]);
  });

  it("breaks a tie on total by visits, then by name", () => {
    const screen = ready({
      rows: [
        at("SAMPLE ZOO", 1000),
        at("SAMPLE APIARY", 1000),
        at("SAMPLE MARKET", 500),
        at("SAMPLE MARKET", 500),
      ],
    });

    expect(merchants(screen).map(({ name }) => name)).toEqual([
      "SAMPLE MARKET",
      "SAMPLE APIARY",
      "SAMPLE ZOO",
    ]);
  });

  it("lists only the top 10", () => {
    const screen = ready({
      rows: Array.from({ length: 12 }, (_, index) =>
        at(`SAMPLE SHOP ${String(index + 1).padStart(2, "0")}`, 1000 * (index + 1)),
      ),
    });

    expect(merchants(screen)).toHaveLength(10);
    expect(merchants(screen)[0]).toEqual({
      rank: "1",
      name: "SAMPLE SHOP 12",
      visits: "1",
      total: "$120.00",
    });
    expect(merchants(screen)[9].name).toBe("SAMPLE SHOP 03");
  });

  it("counts only decided Spending in the period, like the donut", () => {
    const screen = ready({
      rows: [
        at("SAMPLE GROCER", 1000),
        at("SAMPLE GROCER", 5000, { hidden: true }),
        at("SAMPLE GROCER", 5000, { category_id: null }),
        at("SAMPLE GROCER", 5000, { type: "personal", category_id: null }),
        at("SAMPLE GROCER", 5000, { type: "transfer", category_id: null }),
        at("SAMPLE GROCER", 5000, { posted_on: "2026-11-02" }),
      ],
    });

    expect(merchants(screen)).toEqual([
      { rank: "1", name: "SAMPLE GROCER", visits: "1", total: "$10.00" },
    ]);
  });

  it("lowers a merchant's total by its refunds, each a visit", () => {
    const screen = ready({
      rows: [at("SAMPLE BOOKS", 2600), at("SAMPLE BOOKS", -1250)],
    });

    expect(merchants(screen)).toEqual([
      { rank: "1", name: "SAMPLE BOOKS", visits: "2", total: "$13.50" },
    ]);
  });

  it("leaves out a merchant whose refunds outweigh its Spending, as the donut does", () => {
    const screen = ready({
      rows: [at("SAMPLE GROCER", 1000), at("SAMPLE BOOKS", -1250)],
    });

    expect(merchants(screen).map(({ name }) => name)).toEqual(["SAMPLE GROCER"]);
  });

  it("says why there are no merchants when the period has no Spending", () => {
    const screen = ready({ rows: [waiting(), personal()] });

    expect(screen.merchants).toEqual({
      hint: null,
      lines: [],
      empty: "No merchants to show, because there's no Spending in this period.",
    });
  });

  it("shows a German account's merchants in EUR", () => {
    const screen = ready({
      accounts: [GIROKONTO],
      accountId: GIROKONTO.id,
      rows: [at("Muster Markt", 2800, { account_id: GIROKONTO.id, currency: "EUR" })],
    });

    expect(screen.merchants.lines[0].total).toBe("€28.00");
  });
});
