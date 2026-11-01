import { describe, expect, it, vi } from "vitest";
import { FxError } from "@/features/fx/errors";
import type { Transaction } from "@/features/import/types";
import { MoneyError } from "@/lib/money";
import { pairTransfers, type PairingAccount } from "./pairTransfers";

const CHECKING = "chase-checking";
const SAVINGS = "chase-savings";
const CARD = "chase-card-1";
const GIRO = "commerzbank-giro";
const NEST_EGG = "commerzbank-savings";

const accounts: PairingAccount[] = [
  { id: CHECKING, format: "chase-bank" },
  { id: SAVINGS, format: "chase-bank" },
  { id: CARD, format: "chase-card" },
  { id: GIRO, format: "commerzbank" },
  { id: NEST_EGG, format: "commerzbank" },
];

let rowsMade = 0;

function row(
  accountId: string,
  minor: number,
  currency: string,
  overrides: Partial<Transaction> = {},
): Transaction {
  rowsMade += 1;
  return {
    accountId,
    fingerprint: `fingerprint-${rowsMade}`,
    postedOn: "2026-10-05",
    amount: { minor, currency },
    description: "EXAMPLE TRANSFER",
    ...overrides,
  };
}

function usd(
  accountId: string,
  minor: number,
  overrides: Partial<Transaction> = {},
): Transaction {
  return row(accountId, minor, "USD", overrides);
}

function id({ accountId, fingerprint }: Transaction) {
  return { accountId, fingerprint };
}

function ids(...rows: Transaction[]) {
  const sortKey = (row: Transaction) => `${row.accountId} ${row.fingerprint}`;
  return [...rows]
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1))
    .map(id);
}

const nothing = { pairs: [], uncertain: [], unpairedCardPayments: [] };

describe("pairTransfers", () => {
  it("finds nothing in no rows", () => {
    expect(pairTransfers([], accounts, {})).toEqual(nothing);
  });

  describe("by transfer number", () => {
    const transferNumber = "10000000001";

    it("pairs two rows on different accounts with opposite amounts", () => {
      const out = usd(CHECKING, -50000, { transferNumber });
      const back = usd(SAVINGS, 50000, { transferNumber });

      expect(pairTransfers([out, back], accounts, {})).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "transfer-number",
            moneyOut: id(out),
            moneyIn: id(back),
          },
        ],
      });
    });

    it("pairs whatever the dates, because the number is the proof", () => {
      const out = usd(CHECKING, -50000, {
        transferNumber,
        postedOn: "2026-01-02",
      });
      const back = usd(SAVINGS, 50000, {
        transferNumber,
        postedOn: "2026-10-05",
      });

      expect(pairTransfers([out, back], accounts, {}).pairs).toHaveLength(1);
    });

    it("leaves one row alone, because the other side may not be imported", () => {
      const lone = usd(CHECKING, -50000, { transferNumber });

      expect(pairTransfers([lone], accounts, {})).toEqual(nothing);
    });

    it("keeps a lone numbered row out of the same-amount check", () => {
      const lone = usd(CHECKING, -50000, { transferNumber });
      const lookalike = usd(SAVINGS, 50000);

      expect(pairTransfers([lone, lookalike], accounts, {})).toEqual(nothing);
    });

    it("keeps a lone numbered row away from a card payment", () => {
      const lone = usd(CHECKING, -50000, { transferNumber });
      const payment = usd(CARD, 50000, { bankType: "Payment" });

      expect(pairTransfers([lone, payment], accounts, {})).toEqual({
        ...nothing,
        unpairedCardPayments: [id(payment)],
      });
    });

    it("keeps a lone numbered row away from another currency", () => {
      const lone = usd(CHECKING, -11000, { transferNumber });
      const euros = row(GIRO, 10000, "EUR");

      expect(
        pairTransfers([lone, euros], accounts, { "2026-10-05": "1.10" }),
      ).toEqual(nothing);
    });

    it("doesn't pair rows with different numbers", () => {
      const out = usd(CHECKING, -50000, { transferNumber: "10000000001" });
      const back = usd(SAVINGS, 50000, { transferNumber: "10000000002" });

      expect(pairTransfers([out, back], accounts, {})).toEqual(nothing);
    });

    it("calls three rows uncertain", () => {
      const rows = [
        usd(CHECKING, -50000, { transferNumber }),
        usd(SAVINGS, 50000, { transferNumber }),
        usd(SAVINGS, 50000, { transferNumber }),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "transfer-number", rows: ids(...rows) }],
      });
    });

    it.each([
      ["different sizes", -50000, 49999],
      ["the same sign", -50000, -50000],
    ])("calls two rows with %s uncertain", (_, outMinor, backMinor) => {
      const rows = [
        usd(CHECKING, outMinor, { transferNumber }),
        usd(SAVINGS, backMinor, { transferNumber }),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "transfer-number", rows: ids(...rows) }],
      });
    });

    it("calls opposite amounts in two currencies uncertain", () => {
      const rows = [
        usd(CHECKING, -50000, { transferNumber }),
        row(GIRO, 50000, "EUR", { transferNumber }),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "transfer-number", rows: ids(...rows) }],
      });
    });

    it("never pairs two rows on one account", () => {
      const rows = [
        usd(CHECKING, -50000, { transferNumber }),
        usd(CHECKING, 50000, { transferNumber }),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "transfer-number", rows: ids(...rows) }],
      });
    });

    it("treats a blank number as no number", () => {
      const out = usd(CHECKING, -50000, {
        transferNumber: " ",
        postedOn: "2026-01-02",
      });
      const back = usd(SAVINGS, 50000, {
        transferNumber: " ",
        postedOn: "2026-10-05",
      });

      expect(pairTransfers([out, back], accounts, {})).toEqual(nothing);
    });
  });

  describe("by card payment", () => {
    function cardPayment(
      minor: number,
      overrides: Partial<Transaction> = {},
    ): Transaction {
      return usd(CARD, minor, { bankType: "Payment", ...overrides });
    }

    it("pairs a payment with its one opposite amount on a bank account", () => {
      const payment = cardPayment(120000);
      const bankRow = usd(CHECKING, -120000, { postedOn: "2026-10-03" });

      expect(pairTransfers([payment, bankRow], accounts, {})).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "card-payment",
            moneyOut: id(bankRow),
            moneyIn: id(payment),
          },
        ],
      });
    });

    it.each([
      ["2026-10-10", "5 days after"],
      ["2026-09-30", "5 days before"],
    ])("counts a bank row on %s, %s", (postedOn) => {
      const payment = cardPayment(120000);
      const bankRow = usd(CHECKING, -120000, { postedOn });

      expect(pairTransfers([payment, bankRow], accounts, {}).pairs).toEqual([
        {
          evidence: "card-payment",
          moneyOut: id(bankRow),
          moneyIn: id(payment),
        },
      ]);
    });

    it("counts days across a clock change", () => {
      // Clocks change on 2026-11-01 in the US.
      const payment = cardPayment(120000, { postedOn: "2026-10-30" });
      const bankRow = usd(CHECKING, -120000, { postedOn: "2026-11-04" });

      expect(pairTransfers([payment, bankRow], accounts, {}).pairs).toHaveLength(
        1,
      );
    });

    it.each([
      ["2026-10-11", "6 days after"],
      ["2026-09-29", "6 days before"],
    ])("puts a payment with a bank row on %s, %s, in unpaired", (postedOn) => {
      const payment = cardPayment(120000);
      const bankRow = usd(CHECKING, -120000, { postedOn });

      expect(pairTransfers([payment, bankRow], accounts, {})).toEqual({
        ...nothing,
        unpairedCardPayments: [id(payment)],
      });
    });

    it("puts a payment with no rows to match in unpaired", () => {
      const payment = cardPayment(120000);

      expect(pairTransfers([payment], accounts, {})).toEqual({
        ...nothing,
        unpairedCardPayments: [id(payment)],
      });
    });

    it("doesn't count an amount in another currency", () => {
      const payment = cardPayment(120000);
      const bankRow = row(GIRO, -120000, "EUR");

      expect(pairTransfers([payment, bankRow], accounts, {})).toEqual({
        ...nothing,
        unpairedCardPayments: [id(payment)],
      });
    });

    it("doesn't count a different amount", () => {
      const payment = cardPayment(120000);
      const bankRow = usd(CHECKING, -119999);

      expect(pairTransfers([payment, bankRow], accounts, {})).toEqual({
        ...nothing,
        unpairedCardPayments: [id(payment)],
      });
    });

    it("doesn't count a row on another card", () => {
      const secondCard = "chase-card-2";
      const payment = cardPayment(120000);
      const other = usd(secondCard, -120000, { bankType: "Payment" });
      const cards: PairingAccount[] = [
        ...accounts,
        { id: secondCard, format: "chase-card" },
      ];

      expect(pairTransfers([payment, other], cards, {})).toEqual({
        ...nothing,
        unpairedCardPayments: ids(payment, other),
      });
    });

    it("calls more than one candidate uncertain", () => {
      const rows = [
        cardPayment(120000),
        usd(CHECKING, -120000),
        usd(SAVINGS, -120000, { postedOn: "2026-10-06" }),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "card-payment", rows: ids(...rows) }],
      });
    });

    it("calls two payments with one candidate uncertain", () => {
      const rows = [
        cardPayment(120000),
        cardPayment(120000, { postedOn: "2026-10-06" }),
        usd(CHECKING, -120000),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "card-payment", rows: ids(...rows) }],
      });
    });

    it("pairs each payment when two have their own bank rows", () => {
      const first = cardPayment(120000);
      const firstBank = usd(CHECKING, -120000);
      const second = cardPayment(45000);
      const secondBank = usd(SAVINGS, -45000);

      const { pairs } = pairTransfers(
        [first, firstBank, second, secondBank],
        accounts,
        {},
      );

      expect(pairs).toHaveLength(2);
    });

    it.each(["Return", "Sale", "Fee", "Adjustment", undefined])(
      "never pairs a card row of bank type %s",
      (bankType) => {
        const cardRow = usd(CARD, 120000, { bankType });
        const bankRow = usd(CHECKING, -120000);

        expect(pairTransfers([cardRow, bankRow], accounts, {})).toEqual(
          nothing,
        );
      },
    );

    it("never pairs a card row of another type by transfer number", () => {
      const transferNumber = "10000000001";
      const cardRow = usd(CARD, 120000, { bankType: "Return", transferNumber });
      const bankRow = usd(CHECKING, -120000, { transferNumber });

      expect(pairTransfers([cardRow, bankRow], accounts, {})).toEqual(nothing);
    });

    it("needs the bank type to match exactly", () => {
      const cardRow = cardPayment(120000, { bankType: "payment" });
      const bankRow = usd(CHECKING, -120000);

      expect(pairTransfers([cardRow, bankRow], accounts, {})).toEqual(nothing);
    });

    it("doesn't treat a bank row called Payment as a card payment", () => {
      const bankRow = usd(CHECKING, 120000, { bankType: "Payment" });

      expect(pairTransfers([bankRow], accounts, {})).toEqual(nothing);
    });
  });

  describe("across currencies", () => {
    const rates = { "2026-10-05": "1.10" };

    function eur(
      minor: number,
      overrides: Partial<Transaction> = {},
    ): Transaction {
      return row(GIRO, minor, "EUR", overrides);
    }

    it("pairs euros out with dollars in", () => {
      const out = eur(-10000);
      const back = usd(CHECKING, 11000, { postedOn: "2026-10-07" });

      expect(pairTransfers([out, back], accounts, rates)).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "cross-currency",
            moneyOut: id(out),
            moneyIn: id(back),
          },
        ],
      });
    });

    it("pairs dollars out with euros in", () => {
      const out = usd(CHECKING, -11000);
      const back = eur(10000, { postedOn: "2026-10-07" });

      expect(pairTransfers([out, back], accounts, rates)).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "cross-currency",
            moneyOut: id(out),
            moneyIn: id(back),
          },
        ],
      });
    });

    it("uses the rate on the date of the row with money out", () => {
      const out = eur(-10000);
      const back = usd(CHECKING, 11000, { postedOn: "2026-10-07" });
      const twoRates = { "2026-10-05": "1.10", "2026-10-07": "2.00" };

      expect(pairTransfers([out, back], accounts, twoRates).pairs).toHaveLength(
        1,
      );
    });

    it("uses that rate when money out is the later row", () => {
      const out = usd(CHECKING, -11000, { postedOn: "2026-10-07" });
      const back = eur(10000);
      const twoRates = { "2026-10-05": "2.00", "2026-10-07": "1.10" };

      expect(pairTransfers([out, back], accounts, twoRates).pairs).toHaveLength(
        1,
      );
    });

    it("falls back to an earlier rate, as findRate does", () => {
      const out = eur(-10000, { postedOn: "2026-10-08" });
      const back = usd(CHECKING, 11000, { postedOn: "2026-10-09" });

      expect(pairTransfers([out, back], accounts, rates).pairs).toHaveLength(1);
    });

    // At 1.10, 100.00 EUR is 110.00 USD, and 5% of that is 5.50.
    it.each([10450, 10451, 11000, 11549, 11550])(
      "pairs %i cents with 100.00 EUR",
      (cents) => {
        const out = eur(-10000);
        const back = usd(CHECKING, cents);

        expect(pairTransfers([out, back], accounts, rates).pairs).toHaveLength(
          1,
        );
      },
    );

    it.each([10449, 11551])(
      "doesn't pair %i cents with 100.00 EUR",
      (cents) => {
        const out = eur(-10000);
        const back = usd(CHECKING, cents);

        expect(pairTransfers([out, back], accounts, rates)).toEqual(nothing);
      },
    );

    // 1,234.56 EUR at 1.085 is 1,339.50 USD after rounding, and 5% of that is
    // 66.975, so 66.97 is inside the limit and 66.98 is outside it.
    it.each([
      [140647, 1],
      [140648, 0],
    ])("checks the limit exactly for %i cents", (cents, pairCount) => {
      const out = eur(-123456);
      const back = usd(CHECKING, cents);

      expect(
        pairTransfers([out, back], accounts, { "2026-10-05": "1.085" }).pairs,
      ).toHaveLength(pairCount);
    });

    it.each([
      ["2026-10-10", 1],
      ["2026-10-11", 0],
    ])("with money in on %s, pairs %i", (postedOn, pairCount) => {
      const out = eur(-10000);
      const back = usd(CHECKING, 11000, { postedOn });

      expect(pairTransfers([out, back], accounts, rates).pairs).toHaveLength(
        pairCount,
      );
    });

    it("needs opposite signs", () => {
      const rows = [eur(-10000), usd(CHECKING, -11000)];

      expect(pairTransfers(rows, accounts, rates)).toEqual(nothing);
    });

    it("never pairs two rows on one account", () => {
      const rows = [
        row(CHECKING, -10000, "EUR"),
        usd(CHECKING, 11000),
      ];

      expect(pairTransfers(rows, accounts, rates)).toEqual(nothing);
    });

    it("only pairs euros with dollars", () => {
      const rows = [row(GIRO, -10000, "GBP"), usd(CHECKING, 11000)];

      expect(pairTransfers(rows, accounts, rates)).toEqual(nothing);
    });

    it("never uses a card row", () => {
      const out = eur(-10000);
      const payment = usd(CARD, 11000, { bankType: "Payment" });

      expect(pairTransfers([out, payment], accounts, rates)).toEqual({
        ...nothing,
        unpairedCardPayments: [id(payment)],
      });
    });

    it("skips a row whose amount is too far off to be a candidate", () => {
      const out = eur(-10000);
      const back = usd(CHECKING, 11000);
      const unrelated = usd(SAVINGS, 20000);

      expect(
        pairTransfers([out, back, unrelated], accounts, rates).pairs,
      ).toEqual([
        {
          evidence: "cross-currency",
          moneyOut: id(out),
          moneyIn: id(back),
        },
      ]);
    });

    it("calls two dollar candidates for one euro row uncertain", () => {
      const rows = [
        eur(-10000),
        usd(CHECKING, 11000),
        usd(SAVINGS, 10900, { postedOn: "2026-10-06" }),
      ];

      expect(pairTransfers(rows, accounts, rates)).toEqual({
        ...nothing,
        uncertain: [{ reason: "cross-currency", rows: ids(...rows) }],
      });
    });

    it("calls two euro candidates for one dollar row uncertain", () => {
      const rows = [
        eur(-10000),
        row(NEST_EGG, -10100, "EUR"),
        usd(CHECKING, 11000, { postedOn: "2026-10-06" }),
      ];

      expect(pairTransfers(rows, accounts, rates)).toEqual({
        ...nothing,
        uncertain: [{ reason: "cross-currency", rows: ids(...rows) }],
      });
    });

    it("calls a whole chain of candidates uncertain", () => {
      const rows = [
        eur(-10000),
        usd(CHECKING, 10900),
        row(NEST_EGG, -10300, "EUR"),
        usd(SAVINGS, 11600),
      ];

      expect(pairTransfers(rows, accounts, rates)).toEqual({
        ...nothing,
        uncertain: [{ reason: "cross-currency", rows: ids(...rows) }],
      });
    });

    it("pairs two transfers that don't touch", () => {
      const first = [eur(-10000), usd(CHECKING, 11000)];
      const second = [
        row(NEST_EGG, -50000, "EUR"),
        usd(SAVINGS, 55000),
      ];

      expect(
        pairTransfers([...first, ...second], accounts, rates).pairs,
      ).toHaveLength(2);
    });

    it("calls a candidate with no saved rate uncertain", () => {
      const rows = [eur(-10000), usd(CHECKING, 11000)];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "no-rate", rows: ids(...rows) }],
      });
    });

    it("doesn't borrow a rate from after the money went out", () => {
      const rows = [
        eur(-10000),
        usd(CHECKING, 11000, { postedOn: "2026-10-07" }),
      ];

      expect(
        pairTransfers(rows, accounts, { "2026-10-07": "1.10" }),
      ).toEqual({
        ...nothing,
        uncertain: [{ reason: "no-rate", rows: ids(...rows) }],
      });
    });

    it("counts a row with no saved rate as a candidate", () => {
      // The rate covers the first dollar row but not the second, three days
      // earlier, so that one can't be ruled out.
      const rows = [
        eur(10000, { postedOn: "2026-10-11" }),
        usd(CHECKING, -11000, { postedOn: "2026-10-11" }),
        usd(SAVINGS, -11000, { postedOn: "2026-10-08" }),
      ];

      expect(
        pairTransfers(rows, accounts, { "2026-10-10": "1.10" }),
      ).toEqual({
        ...nothing,
        uncertain: [{ reason: "no-rate", rows: ids(...rows) }],
      });
    });
  });

  describe("by same amount alone", () => {
    it("calls two bank rows with opposite amounts uncertain, never paired", () => {
      const rows = [usd(CHECKING, -50000), usd(SAVINGS, 50000)];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "same-amount", rows: ids(...rows) }],
      });
    });

    it("works in euros too", () => {
      const rows = [row(GIRO, -50000, "EUR"), row(NEST_EGG, 50000, "EUR")];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "same-amount", rows: ids(...rows) }],
      });
    });

    it.each([
      ["2026-10-08", 1],
      ["2026-10-02", 1],
      ["2026-10-09", 0],
      ["2026-10-01", 0],
    ])("with a row on %s, finds %i", (postedOn, matchCount) => {
      const rows = [usd(CHECKING, -50000), usd(SAVINGS, 50000, { postedOn })];

      expect(pairTransfers(rows, accounts, {}).uncertain).toHaveLength(
        matchCount,
      );
    });

    it("needs different accounts", () => {
      const rows = [usd(CHECKING, -50000), usd(CHECKING, 50000)];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });

    it("needs one currency", () => {
      const rows = [usd(CHECKING, -50000), row(GIRO, 50000, "GBP")];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });

    it("needs opposite amounts", () => {
      const rows = [usd(CHECKING, -50000), usd(SAVINGS, 49999)];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });

    it("puts every look-alike in one match", () => {
      const rows = [
        usd(CHECKING, -50000),
        usd(CHECKING, -50000, { postedOn: "2026-10-06" }),
        usd(SAVINGS, 50000),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual({
        ...nothing,
        uncertain: [{ reason: "same-amount", rows: ids(...rows) }],
      });
    });
  });

  describe("evidence order", () => {
    const rates = { "2026-10-05": "1.10" };

    it("tries a transfer number before a card payment", () => {
      const transferNumber = "10000000001";
      const out = usd(CHECKING, -50000, { transferNumber });
      const back = usd(SAVINGS, 50000, { transferNumber });
      const payment = usd(CARD, 50000, { bankType: "Payment" });

      expect(pairTransfers([out, back, payment], accounts, rates)).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "transfer-number",
            moneyOut: id(out),
            moneyIn: id(back),
          },
        ],
        unpairedCardPayments: [id(payment)],
      });
    });

    it("tries a card payment before another currency", () => {
      const payment = usd(CARD, 11000, { bankType: "Payment" });
      const bankRow = usd(CHECKING, -11000);
      const euros = row(GIRO, 10000, "EUR");

      expect(pairTransfers([payment, bankRow, euros], accounts, rates)).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "card-payment",
            moneyOut: id(bankRow),
            moneyIn: id(payment),
          },
        ],
      });
    });

    it("tries a card payment before the same amount alone", () => {
      const payment = usd(CARD, 50000, { bankType: "Payment" });
      const bankRow = usd(CHECKING, -50000);
      const lookalike = usd(SAVINGS, 50000);

      expect(
        pairTransfers([payment, bankRow, lookalike], accounts, rates),
      ).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "card-payment",
            moneyOut: id(bankRow),
            moneyIn: id(payment),
          },
        ],
      });
    });

    it("tries another currency before the same amount alone", () => {
      const out = usd(CHECKING, -11000);
      const euros = row(GIRO, 10000, "EUR");
      const lookalike = usd(SAVINGS, 11000);

      expect(pairTransfers([out, euros, lookalike], accounts, rates)).toEqual({
        ...nothing,
        pairs: [
          {
            evidence: "cross-currency",
            moneyOut: id(out),
            moneyIn: id(euros),
          },
        ],
      });
    });

    it("stops at uncertain, so weaker evidence can't decide the row", () => {
      const cardRows = [
        usd(CARD, 11000, { bankType: "Payment" }),
        usd(CHECKING, -11000),
        usd(SAVINGS, -11000),
      ];
      const euros = row(GIRO, 10000, "EUR");

      expect(pairTransfers([...cardRows, euros], accounts, rates)).toEqual({
        ...nothing,
        uncertain: [{ reason: "card-payment", rows: ids(...cardRows) }],
      });
    });

    it("doesn't repeat a row uncertain across currencies as a look-alike", () => {
      const crossRows = [
        usd(CHECKING, -11000),
        row(GIRO, 10000, "EUR"),
        row(NEST_EGG, 10100, "EUR"),
      ];
      const lookalike = usd(SAVINGS, 11000);

      expect(pairTransfers([...crossRows, lookalike], accounts, rates)).toEqual(
        {
          ...nothing,
          uncertain: [{ reason: "cross-currency", rows: ids(...crossRows) }],
        },
      );
    });
  });

  describe("a zero amount", () => {
    it("never pairs by transfer number", () => {
      const transferNumber = "10000000001";
      const rows = [
        usd(CHECKING, 0, { transferNumber }),
        usd(SAVINGS, 0, { transferNumber }),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });

    it("never counts as a card payment", () => {
      const rows = [
        usd(CARD, 0, { bankType: "Payment" }),
        usd(CHECKING, 0),
      ];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });

    it("never pairs across currencies", () => {
      const rows = [row(GIRO, 0, "EUR"), usd(CHECKING, 0)];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });

    it("isn't a candidate when no rate is saved", () => {
      const rows = [row(GIRO, -10000, "EUR"), usd(CHECKING, 0)];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });

    it("never matches on the same amount alone", () => {
      const rows = [usd(CHECKING, 0), usd(SAVINGS, 0)];

      expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
    });
  });

  it("leaves a row on an unlisted account out of every result", () => {
    const rows = [
      usd("unlisted-account", -50000),
      usd(SAVINGS, 50000),
    ];

    expect(pairTransfers(rows, accounts, {})).toEqual(nothing);
  });

  it("gives back only row identities", () => {
    const transferNumber = "10000000001";
    const rows = [
      usd(CHECKING, -50000, { transferNumber }),
      usd(SAVINGS, 50000, { transferNumber }),
    ];

    const [pair] = pairTransfers(rows, accounts, {}).pairs;

    expect(Object.keys(pair.moneyOut).sort()).toEqual([
      "accountId",
      "fingerprint",
    ]);
  });

  describe("whatever the input order", () => {
    const transferNumber = "10000000001";
    const rates = { "2026-10-05": "1.10" };
    const rows = [
      usd(CHECKING, -50000, { transferNumber }),
      usd(SAVINGS, 50000, { transferNumber }),
      usd(CARD, 120000, { bankType: "Payment" }),
      usd(CHECKING, -120000),
      usd(CARD, 45000, { bankType: "Payment" }),
      usd(CHECKING, -45000),
      usd(SAVINGS, -45000),
      usd(CARD, 9900, { bankType: "Payment" }),
      row(GIRO, -10000, "EUR"),
      usd(SAVINGS, 11000),
      row(NEST_EGG, -20000, "EUR"),
      usd(CHECKING, 22000),
      usd(SAVINGS, 21900),
      usd(CHECKING, -7700),
      usd(SAVINGS, 7700),
    ];
    const expected = pairTransfers(rows, accounts, rates);

    it("starts from rows that reach every kind of result", () => {
      expect(expected.pairs.map((pair) => pair.evidence).sort()).toEqual([
        "card-payment",
        "cross-currency",
        "transfer-number",
      ]);
      expect(expected.uncertain.map((match) => match.reason).sort()).toEqual([
        "card-payment",
        "cross-currency",
        "same-amount",
      ]);
      expect(expected.unpairedCardPayments).toHaveLength(1);
    });

    it("gives the same result reversed", () => {
      expect(pairTransfers([...rows].reverse(), accounts, rates)).toEqual(
        expected,
      );
    });

    it.each(rows.map((_, index) => index))(
      "gives the same result starting from row %i",
      (start) => {
        const rotated = [...rows.slice(start), ...rows.slice(0, start)];

        expect(pairTransfers(rotated, accounts, rates)).toEqual(expected);
      },
    );
  });

  describe("bad input", () => {
    const description = "EXAMPLE PRIVATE TEXT";
    const rates = { "2026-10-05": "1.10" };

    function errorFrom(
      rows: Transaction[],
      rowRates: Record<string, string>,
    ): Error {
      try {
        pairTransfers(rows, accounts, rowRates);
      } catch (error) {
        return error as Error;
      }
      throw new Error("Expected pairTransfers to throw.");
    }

    it("refuses a saved rate that isn't a number, with no row data", () => {
      const out = row(GIRO, -10000, "EUR", { description });
      const back = usd(CHECKING, 11000, { description });

      const error = errorFrom([out, back], { "2026-10-05": "not-a-rate" });

      expect(error).toBeInstanceOf(FxError);
      expect(error.message).not.toMatch(/EXAMPLE|10000|11000|fingerprint/);
    });

    it.each([
      ["a euro amount", -10000.5, 11000],
      ["a dollar amount", -10000, 11000.5],
    ])("refuses %s that isn't whole, with no row data", (_, eurMinor, usdMinor) => {
      const out = row(GIRO, eurMinor, "EUR", { description });
      const back = usd(CHECKING, usdMinor, { description });

      const error = errorFrom([out, back], rates);

      expect(error).toBeInstanceOf(MoneyError);
      expect(error.message).not.toMatch(/EXAMPLE|10000|11000|fingerprint/);
    });

    it("logs nothing", () => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map(
        (method) => vi.spyOn(console, method),
      );
      const out = row(GIRO, -10000, "EUR", { description });
      const back = usd(CHECKING, 11000, { description });

      pairTransfers([out, back], accounts, rates);

      for (const log of logs) expect(log).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });
});
