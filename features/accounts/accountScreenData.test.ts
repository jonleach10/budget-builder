import { describe, expect, it } from "vitest";
import type { TransactionRow } from "@/features/budget/rows";
import {
  buildAccountScreen,
  type AccountRecord,
  type AccountSource,
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
function row(extra: Partial<TransactionRow> = {}): TransactionRow {
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
function spent(category: string, month: string, minor: number): TransactionRow {
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

    // The refund outweighs the period's Spending, so the total is below zero and
    // there's nothing for a share to be part of. The column still adds up.
    expect(changes(screen)).toEqual([
      { name: "Groceries", amount: "$50.00", share: "0%", change: "New", dropped: false },
      { name: "Clothing", amount: "-$80.00", share: "0%", change: "-100%", dropped: true },
    ]);
    // -$30.00 against $80.00 is -138%, but Change never goes below -100%.
    expect(screen.total).toEqual({ amount: "-$30.00", share: "0%", change: "-100%" });
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
