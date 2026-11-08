import { describe, expect, it } from "vitest";
import type { TransactionRow } from "@/features/budget/rows";
import {
  buildAccountScreen,
  type AccountRecord,
  type AccountSource,
  type ReadyAccount,
} from "./accountScreenData";

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
    period: "last-3-months",
    today: "2026-11-08",
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

    expect(screen.categories).toEqual([
      { name: "Gas", amount: "$500.00", share: "50%" },
      { name: "Groceries", amount: "$300.00", share: "30%" },
      { name: "Dining", amount: "$200.00", share: "20%" },
    ]);
    expect(screen.total).toEqual({ amount: "$1,000.00", share: "100%" });
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
      { name: "Groceries", amount: "$200.00", share: "100%" },
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
        { id: CARD.id, label: "Sample Card · Ending 2222" },
        { id: GIROKONTO.id, label: "Sample Girokonto · Ending 3333" },
        { id: SAVINGS.id, label: "Sample Savings · Ending 4444" },
      ],
    });
  });

  it.each([
    ["no account is asked for", null],
    ["the account asked for isn't one of the owner's", "acc-gone"],
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
