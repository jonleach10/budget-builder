import { describe, expect, it } from "vitest";
import { BudgetError } from "./errors";
import {
  toBudget,
  toBudgetEntries,
  toLedger,
  type AccountRow,
  type BudgetAmountRow,
  type CategoryRow,
  type TransactionRow,
} from "./rows";

const ACCOUNTS: AccountRow[] = [
  { id: "acc-us", name: "Joint Checking", country: "US" },
  { id: "acc-de", name: "Joint Checking DE", country: "DE" },
];

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
];

function row(extra: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "t1",
    account_id: "acc-us",
    posted_on: "2026-10-03",
    amount_minor: -1250,
    currency: "USD",
    description: "SAMPLE GROCER",
    base_amount_minor: -1250,
    base_currency: "USD",
    type: "spending",
    category_id: "cat-groceries",
    hidden: false,
    ...extra,
  };
}

describe("toLedger", () => {
  it("maps a database row, with its category ID turned into a name", () => {
    expect(toLedger([row()], ACCOUNTS, CATEGORIES)).toEqual([
      {
        id: "t1",
        postedOn: "2026-10-03",
        country: "US",
        account: "Joint Checking",
        description: "SAMPLE GROCER",
        amount: { minor: -1250, currency: "USD" },
        base: { minor: -1250, currency: "USD" },
        type: "spending",
        category: "Groceries",
      },
    ]);
  });

  it("takes a row's country from its account, not from its currency", () => {
    const ledger = toLedger(
      [row({ account_id: "acc-de", currency: "USD" })],
      ACCOUNTS,
      CATEGORIES,
    );

    expect(ledger[0].country).toBe("DE");
  });

  it("leaves hidden rows out", () => {
    const rows = [row({ id: "shown" }), row({ id: "gone", hidden: true })];

    expect(toLedger(rows, ACCOUNTS, CATEGORIES).map(({ id }) => id)).toEqual([
      "shown",
    ]);
  });

  it("gives a row no category when its ID isn't a known category", () => {
    const ledger = toLedger(
      [row({ category_id: "cat-unknown" })],
      ACCOUNTS,
      CATEGORIES,
    );

    expect(ledger[0].category).toBeNull();
  });

  it("refuses a row whose account is unknown, with no row data in the message", () => {
    const failure = (): unknown =>
      toLedger([row({ account_id: "acc-unknown" })], ACCOUNTS, CATEGORIES);

    expect(failure).toThrow(BudgetError);
    expect(failure).not.toThrow(/SAMPLE|1250/);
  });
});

describe("toBudgetEntries", () => {
  it("keeps spending rows with their category", () => {
    const ledger = toLedger([row()], ACCOUNTS, CATEGORIES);

    expect(toBudgetEntries(ledger, "US")).toEqual([
      {
        postedOn: "2026-10-03",
        category: "Groceries",
        amount: { minor: -1250, currency: "USD" },
      },
    ]);
  });

  it("keeps a row with no type, with no category, so it counts for review", () => {
    const ledger = toLedger(
      [row({ type: null, category_id: "cat-groceries" })],
      ACCOUNTS,
      CATEGORIES,
    );

    expect(toBudgetEntries(ledger, "US")).toEqual([
      {
        postedOn: "2026-10-03",
        category: null,
        amount: { minor: -1250, currency: "USD" },
      },
    ]);
  });

  it.each(["income", "transfer", "saved", "personal"])(
    "leaves out %s rows",
    (type) => {
      const ledger = toLedger(
        [row({ type, category_id: null })],
        ACCOUNTS,
        CATEGORIES,
      );

      expect(toBudgetEntries(ledger, "US")).toEqual([]);
    },
  );

  it("keeps only the country's rows", () => {
    const ledger = toLedger(
      [
        row({ id: "us" }),
        row({ id: "de", account_id: "acc-de", currency: "EUR" }),
      ],
      ACCOUNTS,
      CATEGORIES,
    );

    expect(toBudgetEntries(ledger, "DE")).toEqual([
      {
        postedOn: "2026-10-03",
        category: "Groceries",
        amount: { minor: -1250, currency: "EUR" },
      },
    ]);
  });
});

describe("toBudget", () => {
  const amounts: BudgetAmountRow[] = [
    {
      month: "2026-10",
      country: "US",
      category_id: "cat-groceries",
      amount_minor: 45000,
    },
    {
      month: "2026-10",
      country: "DE",
      category_id: "cat-groceries",
      amount_minor: 30000,
    },
    {
      month: "2026-09",
      country: "US",
      category_id: "cat-dining",
      amount_minor: 20000,
    },
  ];

  it("gives the month and country's amounts, by category name", () => {
    expect(toBudget(amounts, "2026-10", "US", CATEGORIES)).toEqual({
      month: "2026-10",
      country: "US",
      amounts: { Groceries: 45000 },
    });
  });

  it("gives no amounts for a month with no rows", () => {
    expect(toBudget(amounts, "2026-11", "DE", CATEGORIES).amounts).toEqual({});
  });

  it("refuses a month that isn't YYYY-MM", () => {
    expect(() => toBudget(amounts, "2026-10-01", "US", CATEGORIES)).toThrow(
      BudgetError,
    );
  });
});
