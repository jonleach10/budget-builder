import { describe, expect, it } from "vitest";
import type { RuleRow } from "@/features/rules/rules";
import {
  classifyImport,
  storedRowWindow,
  type ClassifyInput,
} from "./classifyImport";
import type { StoredTransaction } from "./storedTransactions";
import type { Transaction } from "./types";

const ACCOUNTS: ClassifyInput["accounts"] = [
  { id: "bank-1", format: "chase-bank" },
  { id: "savings-1", format: "chase-bank" },
  { id: "card-1", format: "chase-card" },
  { id: "euro-1", format: "commerzbank" },
];

const FEES = { id: "category-fees", name: "Fees" };
const GROCERIES = { id: "category-groceries", name: "Groceries" };

function row(fingerprint: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    accountId: "bank-1",
    fingerprint,
    postedOn: "2026-10-10",
    amount: { minor: -2500, currency: "USD" },
    description: "SYNTHETIC SHOP",
    ...overrides,
  };
}

function stored(
  fingerprint: string,
  overrides: Partial<StoredTransaction> = {},
): StoredTransaction {
  return {
    ...row(fingerprint),
    id: `id-${fingerprint}`,
    type: null,
    categoryId: null,
    categorySource: null,
    suggestedCategoryId: null,
    note: null,
    hidden: false,
    possibleDuplicate: false,
    transferPairId: null,
    ...overrides,
  };
}

function rule(overrides: Partial<RuleRow>): RuleRow {
  return {
    id: "rule-1",
    match_on: "descriptionContains",
    value: "SYNTHETIC",
    position: 0,
    type: null,
    category_id: null,
    ...overrides,
  };
}

function classify(input: Partial<ClassifyInput>) {
  return classifyImport({
    transactions: [],
    storedNearby: [],
    confirmed: [],
    accounts: ACCOUNTS,
    rules: [],
    categories: [FEES, GROCERIES],
    ...input,
  });
}

describe("classifyImport", () => {
  it("gives an ordinary purchase the bank's type and leaves its category to review", () => {
    const { decisions, pairs } = classify({
      transactions: [row("a", { bankType: "DEBIT_CARD" })],
    });

    expect(decisions).toEqual([{ type: "spending" }]);
    expect(pairs).toEqual([]);
  });

  it("gives a rule's type before the bank's", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "DEBIT_CARD" })],
      rules: [rule({ type: "personal" })],
    });

    expect(decisions).toEqual([{ type: "personal" }]);
  });

  it("gives a row a rule's category, which makes it spending", () => {
    const { decisions } = classify({
      transactions: [row("a")],
      rules: [rule({ category_id: GROCERIES.id })],
    });

    expect(decisions).toEqual([
      {
        type: "spending",
        category_id: GROCERIES.id,
        category_source: "rule",
      },
    ]);
  });

  it("leaves a row with no rule and no bank type for review", () => {
    const { decisions } = classify({ transactions: [row("a")] });

    expect(decisions).toEqual([{}]);
  });

  it("gives a fee its category from the bank's type", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "Fee" })],
    });

    expect(decisions).toEqual([
      {
        type: "spending",
        category_id: FEES.id,
        category_source: "bank-type",
      },
    ]);
  });

  it("sends a row to review when its category has been renamed", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "Fee" })],
      categories: [{ id: FEES.id, name: "Bank Charges" }],
    });

    expect(decisions).toEqual([{ type: "spending" }]);
  });

  it("sends a row to review when a Spending rule has no category", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "Fee" })],
      rules: [rule({ type: "spending" })],
    });

    expect(decisions).toEqual([{ type: "spending" }]);
  });
});

describe("classifyImport with past categories", () => {
  const manual = (
    fingerprint: string,
    categoryId: string,
    overrides: Partial<StoredTransaction> = {},
  ) =>
    stored(fingerprint, {
      type: "spending",
      categoryId,
      categorySource: "manual",
      ...overrides,
    });

  it("gives a merchant the category the owner confirmed", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "DEBIT_CARD" })],
      confirmed: [manual("old", GROCERIES.id)],
    });

    expect(decisions).toEqual([
      {
        type: "spending",
        category_id: GROCERIES.id,
        category_source: "history",
      },
    ]);
  });

  it("makes a confirmed merchant's row spending when the bank gives no type", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "Transfer" })],
      confirmed: [manual("old", GROCERIES.id)],
    });

    expect(decisions).toEqual([
      {
        type: "spending",
        category_id: GROCERIES.id,
        category_source: "history",
      },
    ]);
  });

  it("sends a confirmed merchant's row to review when it may be a transfer", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "Transfer" })],
      storedNearby: [
        stored("b", {
          accountId: "savings-1",
          amount: { minor: 2500, currency: "USD" },
        }),
      ],
      confirmed: [manual("old", GROCERIES.id)],
    });

    expect(decisions).toEqual([{}]);
  });

  it("leaves a numbered row open to pairing when its merchant is confirmed", () => {
    const { decisions } = classify({
      transactions: [
        row("a", { bankType: "ACCT_XFER", transferNumber: "12345678901" }),
      ],
      confirmed: [manual("old", GROCERIES.id)],
    });

    expect(decisions).toEqual([{}]);
  });

  it("gives a mixed merchant's row no type when the bank gives none", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "Transfer" })],
      confirmed: [manual("one", GROCERIES.id), manual("two", FEES.id)],
    });

    expect(decisions).toEqual([{}]);
  });

  it("learns nothing from a stored row the owner didn't confirm", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "DEBIT_CARD" })],
      storedNearby: [
        stored("old", {
          type: "spending",
          categoryId: GROCERIES.id,
          categorySource: "history",
        }),
      ],
      confirmed: [
        stored("rule-row", {
          type: "spending",
          categoryId: GROCERIES.id,
          categorySource: "rule",
        }),
      ],
    });

    expect(decisions).toEqual([{ type: "spending" }]);
  });

  it("sends a mixed merchant to review, past the bank's type", () => {
    const { decisions } = classify({
      transactions: [row("a", { bankType: "Fee" })],
      confirmed: [manual("one", GROCERIES.id), manual("two", FEES.id)],
    });

    expect(decisions).toEqual([{ type: "spending" }]);
  });
});

describe("classifyImport with transfers", () => {
  const NUMBER = "12345678901";
  const moneyOut = {
    accountId: "bank-1",
    amount: { minor: -10000, currency: "USD" },
    transferNumber: NUMBER,
  };
  const moneyIn = {
    accountId: "savings-1",
    amount: { minor: 10000, currency: "USD" },
    transferNumber: NUMBER,
  };
  const THE_PAIR = {
    moneyOut: { accountId: "bank-1", fingerprint: "out" },
    moneyIn: { accountId: "savings-1", fingerprint: "in" },
  };
  const cardPayment = {
    accountId: "card-1",
    amount: { minor: 25000, currency: "USD" },
    bankType: "Payment",
  };
  const purchase = { bankType: "DEBIT_CARD" };

  it("pairs two rows of one upload that share a number", () => {
    const { decisions, pairs } = classify({
      transactions: [row("out", moneyOut), row("in", moneyIn)],
    });

    expect(decisions).toEqual([{ type: "transfer" }, { type: "transfer" }]);
    expect(pairs).toEqual([THE_PAIR]);
  });

  it("pairs a card payment with the bank row that paid it", () => {
    const { decisions, pairs } = classify({
      transactions: [
        row("pay", cardPayment),
        row("bank", { amount: { minor: -25000, currency: "USD" } }),
      ],
    });

    expect(decisions).toEqual([{ type: "transfer" }, { type: "transfer" }]);
    expect(pairs).toEqual([
      {
        moneyOut: { accountId: "bank-1", fingerprint: "bank" },
        moneyIn: { accountId: "card-1", fingerprint: "pay" },
      },
    ]);
  });

  it("stores an unpaired card payment as a transfer", () => {
    const { decisions, pairs } = classify({
      transactions: [row("pay", cardPayment)],
    });

    expect(decisions).toEqual([{ type: "transfer" }]);
    expect(pairs).toEqual([]);
  });

  it("gives a row in an uncertain match no default type", () => {
    const { decisions, pairs } = classify({
      transactions: [
        row("a", { ...purchase, amount: { minor: -2500, currency: "USD" } }),
        row("b", {
          ...purchase,
          accountId: "savings-1",
          amount: { minor: 2500, currency: "USD" },
        }),
      ],
    });

    expect(decisions).toEqual([{}, {}]);
    expect(pairs).toEqual([]);
  });

  it("keeps a rule's type on a row in an uncertain match", () => {
    const { decisions } = classify({
      transactions: [
        row("a", { description: "RENT TRANSFER", ...purchase }),
        row("b", {
          ...purchase,
          accountId: "savings-1",
          amount: { minor: 2500, currency: "USD" },
        }),
      ],
      rules: [rule({ value: "RENT", type: "transfer" })],
    });

    expect(decisions).toEqual([{ type: "transfer" }, {}]);
  });

  it("keeps a row with another rule type out of pairing", () => {
    const { decisions, pairs } = classify({
      transactions: [
        row("out", { ...moneyOut, description: "RENT TRANSFER" }),
        row("in", moneyIn),
      ],
      rules: [rule({ value: "RENT", type: "personal" })],
    });

    expect(decisions).toEqual([{ type: "personal" }, {}]);
    expect(pairs).toEqual([]);
  });

  it("never pairs EUR and USD rows", () => {
    const { decisions, pairs } = classify({
      transactions: [
        row("a", { ...purchase, amount: { minor: -2500, currency: "USD" } }),
        row("b", {
          ...purchase,
          accountId: "euro-1",
          amount: { minor: 2500, currency: "EUR" },
        }),
      ],
    });

    expect(decisions).toEqual([{ type: "spending" }, { type: "spending" }]);
    expect(pairs).toEqual([]);
  });

  describe("and stored rows", () => {
    it("pairs a new row with a stored row from an earlier upload", () => {
      const { decisions, pairs } = classify({
        transactions: [row("out", moneyOut)],
        storedNearby: [stored("in", moneyIn)],
      });

      expect(decisions).toEqual([{ type: "transfer" }]);
      expect(pairs).toEqual([THE_PAIR]);
    });

    it("pairs a stored card payment five days from its bank row", () => {
      const { pairs } = classify({
        transactions: [
          row("bank", {
            postedOn: "2026-10-15",
            amount: { minor: -25000, currency: "USD" },
          }),
        ],
        storedNearby: [stored("pay", { ...cardPayment, type: "transfer" })],
      });

      expect(pairs).toEqual([
        {
          moneyOut: { accountId: "bank-1", fingerprint: "bank" },
          moneyIn: { accountId: "card-1", fingerprint: "pay" },
        },
      ]);
    });

    it("doesn't pair a stored row of another type", () => {
      const { decisions, pairs } = classify({
        transactions: [row("out", { ...moneyOut, ...purchase })],
        storedNearby: [stored("in", { ...moneyIn, type: "spending" })],
      });

      expect(decisions).toEqual([{ type: "spending" }]);
      expect(pairs).toEqual([]);
    });

    it("doesn't pair a stored row that already has a pair", () => {
      const { decisions, pairs } = classify({
        transactions: [row("out", { ...moneyOut, ...purchase })],
        storedNearby: [
          stored("in", {
            ...moneyIn,
            type: "transfer",
            transferPairId: "pair-1",
          }),
        ],
      });

      expect(decisions).toEqual([{ type: "spending" }]);
      expect(pairs).toEqual([]);
    });

    it("sends a new row to review when a stored row makes it uncertain", () => {
      const { decisions, pairs } = classify({
        transactions: [
          row("a", { ...purchase, amount: { minor: -2500, currency: "USD" } }),
        ],
        storedNearby: [
          stored("b", {
            accountId: "savings-1",
            amount: { minor: 2500, currency: "USD" },
          }),
        ],
      });

      expect(decisions).toEqual([{}]);
      expect(pairs).toEqual([]);
    });
  });

  describe("and rows sent again", () => {
    it("sends no pairs when a paired transfer is imported again", () => {
      const { pairs } = classify({
        transactions: [row("out", moneyOut), row("in", moneyIn)],
        storedNearby: [
          stored("out", {
            ...moneyOut,
            type: "transfer",
            transferPairId: "pair-1",
          }),
          stored("in", {
            ...moneyIn,
            type: "transfer",
            transferPairId: "pair-1",
          }),
        ],
      });

      expect(pairs).toEqual([]);
    });

    it("pairs a new row with a stored row its file also repeats", () => {
      const { decisions, pairs } = classify({
        transactions: [row("out", moneyOut), row("in", moneyIn)],
        storedNearby: [stored("in", moneyIn)],
      });

      expect(decisions[0]).toEqual({ type: "transfer" });
      expect(pairs).toEqual([THE_PAIR]);
    });

    it("judges a repeated row by what's stored, not by its copy", () => {
      const { decisions, pairs } = classify({
        transactions: [row("out", moneyOut), row("in", moneyIn)],
        storedNearby: [stored("in", { ...moneyIn, type: "spending" })],
      });

      expect(decisions[0]).toEqual({});
      expect(pairs).toEqual([]);
    });

    it("counts a row in two files of one upload once", () => {
      const { decisions, pairs } = classify({
        transactions: [
          row("out", moneyOut),
          row("out", moneyOut),
          row("in", moneyIn),
        ],
      });

      expect(decisions).toEqual([
        { type: "transfer" },
        { type: "transfer" },
        { type: "transfer" },
      ]);
      expect(pairs).toEqual([THE_PAIR]);
    });

    it("leaves two stored rows alone when no new row is in their pair", () => {
      const { pairs } = classify({
        transactions: [row("a", purchase)],
        storedNearby: [stored("out", moneyOut), stored("in", moneyIn)],
      });

      expect(pairs).toEqual([]);
    });
  });
});

describe("storedRowWindow", () => {
  it("reaches past the upload's dates by more than pairing can", () => {
    expect(
      storedRowWindow([
        row("late", { postedOn: "2026-10-20" }),
        row("early", { postedOn: "2026-10-10" }),
      ]),
    ).toEqual({ from: "2026-10-03", to: "2026-10-27" });
  });

  it("has no window for an upload with no rows", () => {
    expect(storedRowWindow([])).toBeNull();
  });
});
