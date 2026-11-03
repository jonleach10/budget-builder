import { describe, expect, it } from "vitest";
import { createBudget } from "@/features/budget/budget";
import { compareBudget } from "@/features/budget/compareBudget";
import { BudgetError } from "@/features/budget/errors";
import {
  toBudgetEntries,
  toLedger,
  type AccountRow,
  type CategoryRow,
  type TransactionRow,
} from "@/features/budget/rows";
import {
  accounts,
  chaseBankFileName,
  loadFixture,
  passThroughHash,
} from "@/features/import/__fixtures__/load";
import { parseStatement } from "@/features/import/parseStatement";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import {
  buildTransactionsScreen,
  type TransactionLine,
  type TransactionsScreenData,
} from "./transactionsScreenData";

const ACCOUNTS: AccountRow[] = [
  { id: "acc-us", name: "Joint Checking", country: "US" },
  { id: "acc-de", name: "Girokonto", country: "DE" },
];

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
];

function row(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: "t1",
    accountId: "acc-us",
    fingerprint: "fingerprint-1",
    postedOn: "2026-10-03",
    amount: { minor: -4000, currency: "USD" },
    base: { minor: -4000, currency: "USD" },
    description: "SAMPLE GROCER",
    type: "spending",
    categoryId: "cat-groceries",
    categorySource: "manual",
    suggestedCategoryId: null,
    note: null,
    hidden: false,
    possibleDuplicate: false,
    transferPairId: null,
    ...extra,
  };
}

function screen(
  rows: readonly StoredTransaction[],
  extra: Partial<Parameters<typeof buildTransactionsScreen>[0]> = {},
): TransactionsScreenData {
  return buildTransactionsScreen({
    rows,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    ...extra,
  });
}

function oneLine(extra: Partial<StoredTransaction> = {}): TransactionLine {
  return screen([row(extra)]).lines[0];
}

describe("buildTransactionsScreen", () => {
  it("turns a stored row into a line", () => {
    expect(oneLine()).toEqual({
      id: "t1",
      date: "Oct 3",
      title: "SAMPLE GROCER",
      bankText: null,
      purpose: null,
      bankType: null,
      bankCategory: null,
      accountId: "acc-us",
      account: "Joint Checking",
      type: "spending",
      typeLabel: "Spending",
      categoryId: "cat-groceries",
      category: "Groceries",
      amount: "-$40.00",
      original: null,
      needsReview: false,
      paired: false,
      pairedWith: null,
      hidden: false,
    });
  });

  it("keeps the bank's type and category, which Edit Row shows", () => {
    expect(
      oneLine({ bankType: "DEBIT_CARD", bankCategory: "Groceries" }),
    ).toMatchObject({ bankType: "DEBIT_CARD", bankCategory: "Groceries" });
  });

  it("puts the newest rows first, and settles a tie by ID", () => {
    const lines = screen([
      row({ id: "old", postedOn: "2026-10-01" }),
      row({ id: "b", postedOn: "2026-10-20" }),
      row({ id: "a", postedOn: "2026-10-20" }),
    ]).lines;

    expect(lines.map(({ id }) => id)).toEqual(["a", "b", "old"]);
  });

  it("shows the bank text when the row has no label", () => {
    expect(oneLine({ note: null })).toMatchObject({
      title: "SAMPLE GROCER",
      bankText: null,
    });
  });

  it("shows the label first, with the bank text under it", () => {
    expect(oneLine({ note: "Corner shop" })).toMatchObject({
      title: "Corner shop",
      bankText: "SAMPLE GROCER",
    });
  });

  it("treats a blank label as no label", () => {
    expect(oneLine({ note: "   " })).toMatchObject({
      title: "SAMPLE GROCER",
      bankText: null,
    });
  });

  it("keeps the purpose, which search covers", () => {
    expect(oneLine({ purpose: "Card payment" }).purpose).toBe("Card payment");
  });

  it("shows a USD row's amount with nothing under it", () => {
    const line = oneLine();

    expect(line.amount).toBe("-$40.00");
    expect(line.original).toBeNull();
  });

  it("shows a EUR row's USD amount first, with the bank's amount under it", () => {
    const line = oneLine({
      accountId: "acc-de",
      amount: { minor: -1200, currency: "EUR" },
      base: { minor: -1314, currency: "USD" },
    });

    expect(line.amount).toBe("-$13.14");
    expect(line.original).toBe("-€12.00");
  });

  it("gives a USD row's unsigned bank-recorded original the row's money-out sign", () => {
    const line = oneLine({
      original: { amount: { minor: 1200, currency: "EUR" }, rate: "1.08" },
    });

    expect(line.amount).toBe("-$40.00");
    expect(line.original).toBe("-€12.00");
  });

  it("keeps a refund's bank-recorded original as money in", () => {
    const line = oneLine({
      amount: { minor: 4000, currency: "USD" },
      base: { minor: 4000, currency: "USD" },
      original: { amount: { minor: 1200, currency: "EUR" }, rate: "1.08" },
    });

    expect(line.amount).toBe("$40.00");
    expect(line.original).toBe("€12.00");
  });

  it("shows a Chase foreign purchase as the adapter parses it with money out on both lines", async () => {
    const { transactions } = await parseStatement({
      fileName: chaseBankFileName,
      text: loadFixture(chaseBankFileName),
      accounts,
      hash: passThroughHash,
    });
    const parsed = transactions.find(
      ({ original }) => original?.amount.currency === "EUR",
    );
    if (parsed === undefined) throw new Error("fixture has no foreign row");

    const line = oneLine({
      ...parsed,
      accountId: "acc-us",
      base: parsed.amount,
    });

    expect(line.amount).toBe("-$13.34");
    expect(line.original).toBe("-€11.90");
  });

  it("shows a EUR row's own amount, not its bank-recorded original, under the USD amount", () => {
    const line = oneLine({
      accountId: "acc-de",
      amount: { minor: -9200, currency: "EUR" },
      base: { minor: -9940, currency: "USD" },
      original: { amount: { minor: 10000, currency: "USD" }, rate: "1.087" },
    });

    expect(line.amount).toBe("-$99.40");
    expect(line.original).toBe("-€92.00");
  });

  it("gives a row with no type no type label", () => {
    expect(oneLine({ type: null, categoryId: null })).toMatchObject({
      type: null,
      typeLabel: null,
      category: null,
    });
  });

  it.each([
    ["income", "Income"],
    ["transfer", "Transfer"],
    ["saved", "Saved"],
    ["personal", "Personal"],
  ] as const)("labels the %s type", (type, label) => {
    expect(oneLine({ type, categoryId: null }).typeLabel).toBe(label);
  });

  it("marks a row in a transfer pair", () => {
    expect(
      oneLine({ type: "transfer", categoryId: null, transferPairId: "pair-1" })
        .paired,
    ).toBe(true);
    expect(oneLine({ transferPairId: null }).paired).toBe(false);
  });

  it("says which row a paired row goes with, by account and amount", () => {
    const paired: Partial<StoredTransaction> = {
      type: "transfer",
      categoryId: null,
      transferPairId: "pair-1",
    };
    const lines = screen([
      row({
        ...paired,
        id: "out",
        amount: { minor: -81240, currency: "USD" },
        base: { minor: -81240, currency: "USD" },
      }),
      row({
        ...paired,
        id: "in",
        accountId: "acc-de",
        amount: { minor: 75000, currency: "EUR" },
        base: { minor: 81240, currency: "USD" },
      }),
    ]).lines;

    expect(lines.find(({ id }) => id === "out")?.pairedWith).toEqual({
      account: "Girokonto",
      amount: "$812.40",
    });
    expect(lines.find(({ id }) => id === "in")?.pairedWith).toEqual({
      account: "Joint Checking",
      amount: "-$812.40",
    });
  });

  it("names no other row when it's in another month", () => {
    const line = oneLine({
      type: "transfer",
      categoryId: null,
      transferPairId: "pair-1",
    });

    expect(line).toMatchObject({ paired: true, pairedWith: null });
  });

  it("keeps hidden rows, so Show Hidden can bring them in", () => {
    expect(oneLine({ hidden: true }).hidden).toBe(true);
  });

  it("marks rows that need review", () => {
    expect(oneLine({ type: null, categoryId: null }).needsReview).toBe(true);
    expect(oneLine({ categoryId: null }).needsReview).toBe(true);
    expect(oneLine().needsReview).toBe(false);
    expect(oneLine({ type: "income", categoryId: null }).needsReview).toBe(
      false,
    );
  });

  it("doesn't mark a hidden row for review", () => {
    expect(
      oneLine({ type: null, categoryId: null, hidden: true }).needsReview,
    ).toBe(false);
  });

  it("marks spending for review when its category ID isn't known, as Budget does", () => {
    expect(oneLine({ categoryId: "cat-unknown" })).toMatchObject({
      category: null,
      needsReview: true,
    });
  });

  it("counts the same rows as Budget's needs-review count", () => {
    const stored = [
      row({ id: "done" }),
      row({ id: "no-type", type: null, categoryId: null }),
      row({ id: "no-category", categoryId: null }),
      row({ id: "unknown-category", categoryId: "cat-unknown" }),
      row({ id: "hidden-open", categoryId: null, hidden: true }),
      row({ id: "income", type: "income", categoryId: null }),
      row({ id: "transfer", type: "transfer", categoryId: null }),
    ];
    const asBudgetRow = (line: StoredTransaction): TransactionRow => ({
      id: line.id,
      account_id: line.accountId,
      posted_on: line.postedOn,
      amount_minor: line.amount.minor,
      currency: line.amount.currency,
      description: line.description,
      base_amount_minor: line.base.minor,
      base_currency: line.base.currency,
      type: line.type,
      category_id: line.categoryId,
      hidden: line.hidden,
    });
    const ledger = toLedger(stored.map(asBudgetRow), ACCOUNTS, CATEGORIES);

    const budgetCount = compareBudget(
      createBudget("2026-10", "US", {}),
      toBudgetEntries(ledger, "US"),
    ).needsReview;
    const screenCount = screen(stored).lines.filter(
      (line) => line.needsReview,
    ).length;

    expect(budgetCount).toBe(3);
    expect(screenCount).toBe(budgetCount);
  });

  it("refuses a row whose account is unknown, with no row data in the message", () => {
    const failure = (): unknown => screen([row({ accountId: "acc-unknown" })]);

    expect(failure).toThrow(BudgetError);
    expect(failure).not.toThrow(/SAMPLE|4000/);
  });

  it("lists the accounts by name", () => {
    expect(screen([]).accounts).toEqual([
      { id: "acc-de", name: "Girokonto" },
      { id: "acc-us", name: "Joint Checking" },
    ]);
  });

  it("settles two accounts with one name by ID", () => {
    const accounts: AccountRow[] = [
      { id: "acc-b", name: "Joint Checking", country: "US" },
      { id: "acc-a", name: "Joint Checking", country: "US" },
    ];

    expect(screen([], { accounts }).accounts.map(({ id }) => id)).toEqual([
      "acc-a",
      "acc-b",
    ]);
  });

  it("lists the categories in the order it was given", () => {
    expect(screen([]).categories).toEqual([
      { id: "cat-groceries", name: "Groceries" },
      { id: "cat-dining", name: "Dining" },
    ]);
  });
});
