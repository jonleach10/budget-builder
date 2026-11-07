import { describe, expect, it } from "vitest";
import type { AccountRow, CategoryRow } from "@/features/budget/rows";
import { needsReview } from "@/features/categorize/needsReview";
import type { PairingAccount } from "@/features/categorize/pairTransfers";
import { merchantKey } from "@/features/categorize/pastCategories";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import { buildReviewInbox, type ReviewInbox } from "./reviewInbox";

const ACCOUNTS: AccountRow[] = [
  { id: "acc-us", name: "Joint Checking", country: "US" },
  { id: "acc-de", name: "Girokonto", country: "DE" },
  { id: "acc-savings", name: "Joint Savings", country: "US" },
  { id: "acc-card", name: "Joint Card", country: "US" },
];

const PAIRING_ACCOUNTS: PairingAccount[] = [
  { id: "acc-us", format: "chase-bank" },
  { id: "acc-de", format: "commerzbank" },
  { id: "acc-savings", format: "chase-bank" },
  { id: "acc-card", format: "chase-card" },
];

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
];

let nextId = 0;

/** A stored row in review: no type, no category, nothing decided. */
function row(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  nextId += 1;
  return {
    id: `t${nextId}`,
    accountId: "acc-us",
    fingerprint: `fingerprint-${nextId}`,
    postedOn: "2026-10-03",
    amount: { minor: -4000, currency: "USD" },
    base: { minor: -4000, currency: "USD" },
    description: "SAMPLE GROCER",
    type: null,
    categoryId: null,
    categorySource: null,
    suggestedCategoryId: null,
    note: null,
    hidden: false,
    possibleDuplicate: false,
    transferPairId: null,
    ...extra,
  };
}

/** A row the owner already gave a category, which past categories learn from. */
function confirmed(
  categoryId: string,
  extra: Partial<StoredTransaction> = {},
): StoredTransaction {
  return row({
    type: "spending",
    categoryId,
    categorySource: "manual",
    ...extra,
  });
}

function inbox(rows: readonly StoredTransaction[]): ReviewInbox {
  return buildReviewInbox({
    rows,
    accounts: ACCOUNTS,
    pairingAccounts: PAIRING_ACCOUNTS,
    categories: CATEGORIES,
    thisMonth: "2026-11",
  });
}

/** Money leaving checking, in review, for a transfer test. */
function moneyOut(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  return row({
    description: "ONLINE TRANSFER",
    amount: { minor: -50000, currency: "USD" },
    base: { minor: -50000, currency: "USD" },
    ...extra,
  });
}

/** Money reaching savings, in review, for a transfer test. */
function moneyIn(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  return row({
    accountId: "acc-savings",
    postedOn: "2026-10-04",
    description: "ONLINE TRANSFER",
    amount: { minor: 50000, currency: "USD" },
    base: { minor: 50000, currency: "USD" },
    ...extra,
  });
}

function matchIds(result: ReviewInbox): string[][] {
  return result.transfers.map((match) => match.rows.map(({ id }) => id));
}

function groupNames(rows: readonly StoredTransaction[]): string[] {
  return inbox(rows).groups.map(({ name }) => name);
}

describe("buildReviewInbox", () => {
  describe("which rows it holds", () => {
    it("holds exactly the rows Budget counts for review", () => {
      const rows = [
        row({ id: "no-type" }),
        row({ id: "spending-no-category", type: "spending" }),
        row({ id: "hidden", hidden: true }),
        row({ id: "categorized", type: "spending", categoryId: "cat-dining" }),
        row({ id: "income", type: "income" }),
        row({ id: "transfer", type: "transfer", transferPairId: "pair-1" }),
        row({
          id: "unknown-category",
          type: "spending",
          categoryId: "cat-deleted",
        }),
      ];
      const names = new Map(CATEGORIES.map(({ id, name }) => [id, name]));
      const expected = rows
        .filter((stored) =>
          needsReview({
            hidden: stored.hidden,
            type: stored.type,
            category:
              stored.categoryId === null ? null : names.get(stored.categoryId),
          }),
        )
        .map(({ id }) => id)
        .sort();

      const held = inbox(rows).groups.flatMap((group) =>
        group.rows.map(({ id }) => id),
      );

      expect(expected).toEqual([
        "no-type",
        "spending-no-category",
        "unknown-category",
      ]);
      expect(held.sort()).toEqual(expected);
    });

    it("counts the rows left, across groups and No Merchant", () => {
      const result = inbox([
        row(),
        row(),
        row({ description: "SAMPLE CAFE" }),
        row({ description: "" }),
        row({ type: "income" }),
      ]);

      expect(result.left).toBe(4);
      expect(result.subtitle).toBe("4 rows left.");
    });

    it("says 1 row for a single row", () => {
      expect(inbox([row()]).subtitle).toBe("1 row left.");
    });
  });

  describe("merchant groups", () => {
    it("groups rows by merchant key, ignoring case in the bank text", () => {
      const result = inbox([
        row({ description: "SAMPLE GROCER" }),
        row({ description: "Sample Grocer" }),
        row({ description: "SAMPLE CAFE" }),
      ]);

      expect(result.groups.map(({ count }) => count)).toEqual([2, 1]);
    });

    it("groups rows that share an ID, whatever their text", () => {
      const result = inbox([
        row({ description: "SAMPLE UTILITY OCT", ppdId: "000111222" }),
        row({ description: "SAMPLE UTILITY SEP", ppdId: "000111222" }),
      ]);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toMatchObject({
        count: 2,
        detail: "PPD ID 000111222",
      });
    });

    it("names an ordering party ID group by its ID", () => {
      const [group] = inbox([row({ orderingPartyId: "DE00ZZZ00000000001" })])
        .groups;

      expect(group.detail).toBe("Ordering Party ID DE00ZZZ00000000001");
    });

    it("says a text group shares its bank text", () => {
      expect(inbox([row()]).groups[0].detail).toBe("Same bank text");
    });

    it("runs largest group first, and settles a tie by name", () => {
      expect(
        groupNames([
          row({ description: "SAMPLE B" }),
          row({ description: "SAMPLE C" }),
          row({ description: "SAMPLE C" }),
          row({ description: "SAMPLE A" }),
        ]),
      ).toEqual(["SAMPLE C", "SAMPLE A", "SAMPLE B"]);
    });

    it("names a group by its newest row's bank text, not the owner's label", () => {
      const result = inbox([
        row({ ppdId: "1", description: "OLD TEXT", postedOn: "2026-09-01" }),
        row({
          ppdId: "1",
          description: "NEW TEXT",
          postedOn: "2026-10-01",
          note: "Power company",
        }),
      ]);

      expect(result.groups[0].name).toBe("NEW TEXT");
    });

    it("gives the count and the total in USD", () => {
      const [group] = inbox([
        row({ amount: { minor: -6418, currency: "USD" }, base: { minor: -6418, currency: "USD" } }),
        row({ amount: { minor: 1299, currency: "USD" }, base: { minor: 1299, currency: "USD" } }),
      ]).groups;

      expect(group).toMatchObject({
        count: 2,
        countText: "2 rows",
        total: "-$51.19",
      });
    });

    it("totals a EUR group with the USD amounts locked at import", () => {
      const eur = {
        accountId: "acc-de",
        description: "MUSTER BAECKEREI",
        amount: { minor: -1200, currency: "EUR" },
      };
      const [group] = inbox([
        row({ ...eur, base: { minor: -1314, currency: "USD" } }),
        row({ ...eur, base: { minor: -985, currency: "USD" } }),
      ]).groups;

      expect(group.total).toBe("-$22.99");
    });

    it("shows each row with what the owner needs to decide", () => {
      const [group] = inbox([
        row({
          id: "card-row",
          postedOn: "2026-10-28",
          description: "CORNER MARKET",
          purpose: "Card payment",
          bankType: "Sale",
          bankCategory: "Groceries",
          note: "Corner Market",
        }),
      ]).groups;

      expect(group.rows[0]).toMatchObject({
        id: "card-row",
        date: "Oct 28",
        title: "Corner Market",
        bankText: "CORNER MARKET",
        purpose: "Card payment",
        account: "Joint Checking",
        bankType: "Sale",
        bankCategory: "Groceries",
        amount: "-$40.00",
      });
    });

    // The inbox holds every month, so last year's charge and this year's can
    // sit in one group.
    it("adds the year to a row's date only when it isn't this year", () => {
      const [group] = inbox([
        row({ id: "this-year", postedOn: "2026-10-03" }),
        row({ id: "last-year", postedOn: "2025-10-03" }),
      ]).groups;

      expect(group.rows.map(({ date }) => date)).toEqual(["Oct 3", "Oct 3, 2025"]);
    });

    it("adds the year to a No Merchant row's date from another year", () => {
      const [only] = inbox([
        row({ description: "", postedOn: "2025-12-30" }),
      ]).noMerchant;

      expect(only.line.date).toBe("Dec 30, 2025");
    });

    it("puts a group's newest rows first", () => {
      const [group] = inbox([
        row({ id: "old", postedOn: "2026-09-02" }),
        row({ id: "new", postedOn: "2026-10-20" }),
      ]).groups;

      expect(group.rows.map(({ id }) => id)).toEqual(["new", "old"]);
    });

    it("keeps the merchant key its rows share", () => {
      const stored = row({ description: "Sample Grocer" });

      expect(inbox([stored]).groups[0].key).toBe(merchantKey(stored));
    });
  });

  describe("redacted text", () => {
    it("groups rows by the text left around the placeholder, with a reminder", () => {
      const groups = inbox([
        row({ id: "one", description: "ERSTATTUNG [REDACTED]" }),
        row({ id: "two", description: "Erstattung [REDACTED]" }),
      ]).groups;

      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({
        count: 2,
        detail: "Redacted text. Check the rows before you accept.",
      });
    });

    it("says the text is redacted on the phone's group line, after the count", () => {
      const [group] = inbox([
        confirmed("cat-groceries", { description: "PAY [REDACTED]" }),
        row({ description: "PAY [REDACTED]" }),
        row({ description: "PAY [REDACTED]" }),
      ]).groups;

      expect(group.phoneDetail).toBe("2 rows · Redacted text");
    });

    it("suggests the category the owner confirmed for that text", () => {
      const [group] = inbox([
        confirmed("cat-groceries", { description: "PAY [REDACTED]" }),
        row({ description: "PAY [REDACTED]" }),
      ]).groups;

      expect(group.suggestion).toEqual({
        categoryId: "cat-groceries",
        name: "Groceries",
      });
    });

    it("suggests nothing when the owner gave that text two categories", () => {
      const [group] = inbox([
        confirmed("cat-groceries", { description: "PAY [REDACTED]" }),
        confirmed("cat-dining", { description: "PAY [REDACTED]" }),
        row({ description: "PAY [REDACTED]" }),
      ]).groups;

      expect(group.suggestion).toBeNull();
    });

    it("leaves a row holding only the placeholder in No Merchant", () => {
      const result = inbox([row({ id: "only", description: "[REDACTED]" })]);

      expect(result.groups).toEqual([]);
      expect(result.noMerchant.map(({ line }) => line.id)).toEqual(["only"]);
    });
  });

  describe("No Merchant", () => {
    it("holds rows with no merchant key, one at a time, newest first", () => {
      const result = inbox([
        row({ id: "blank", description: "", postedOn: "2026-10-01" }),
        row({ id: "redacted", description: "[REDACTED]", postedOn: "2026-10-09" }),
        row({ id: "grouped" }),
      ]);

      expect(result.noMerchant.map(({ line }) => line.id)).toEqual([
        "redacted",
        "blank",
      ]);
      expect(result.groups.map(({ rows }) => rows.map(({ id }) => id))).toEqual([
        ["grouped"],
      ]);
    });

    it("marks a row whose text lost a number at import", () => {
      const result = inbox([
        row({ id: "redacted", description: "[REDACTED]", postedOn: "2026-10-09" }),
        row({ id: "blank", description: "", postedOn: "2026-10-01" }),
      ]);

      expect(
        result.noMerchant.map(({ line, redacted }) => [line.id, redacted]),
      ).toEqual([
        ["redacted", true],
        ["blank", false],
      ]);
    });

    it("counts its rows in what's left", () => {
      expect(inbox([row({ description: "" })]).left).toBe(1);
    });
  });

  describe("suggestions", () => {
    it("come from the category the owner confirmed for the merchant", () => {
      const [group] = inbox([confirmed("cat-groceries"), row()]).groups;

      expect(group.suggestion).toEqual({
        categoryId: "cat-groceries",
        name: "Groceries",
      });
    });

    it("learn from a confirmed row in any month, hidden or not", () => {
      const [group] = inbox([
        confirmed("cat-dining", { postedOn: "2025-01-05", hidden: true }),
        row(),
      ]).groups;

      expect(group.suggestion?.name).toBe("Dining");
    });

    it("don't learn from a category a rule or the bank gave", () => {
      const [group] = inbox([
        row({ type: "spending", categoryId: "cat-dining", categorySource: "rule" }),
        row({
          type: "spending",
          categoryId: "cat-dining",
          categorySource: "bank-type",
        }),
        row(),
      ]).groups;

      expect(group.suggestion).toBeNull();
    });

    it("fall back to the value stored at import", () => {
      const [group] = inbox([
        row({ suggestedCategoryId: "cat-dining" }),
        row({ suggestedCategoryId: "cat-dining" }),
      ]).groups;

      expect(group.suggestion).toEqual({ categoryId: "cat-dining", name: "Dining" });
    });

    it("prefer a past category over the value stored at import", () => {
      const [group] = inbox([
        confirmed("cat-groceries"),
        row({ suggestedCategoryId: "cat-dining" }),
      ]).groups;

      expect(group.suggestion?.name).toBe("Groceries");
    });

    it("give a group no fallback when its rows' stored values disagree", () => {
      const [group] = inbox([
        row({ suggestedCategoryId: "cat-dining" }),
        row({ suggestedCategoryId: "cat-groceries" }),
      ]).groups;

      expect(group.suggestion).toBeNull();
    });

    it("give a group no fallback when only some rows have a stored value", () => {
      const [group] = inbox([row({ suggestedCategoryId: "cat-dining" }), row()])
        .groups;

      expect(group.suggestion).toBeNull();
    });

    it("skip a stored value whose category is gone", () => {
      const [group] = inbox([row({ suggestedCategoryId: "cat-deleted" })]).groups;

      expect(group.suggestion).toBeNull();
    });

    it("give nothing for a merchant the owner gave two categories", () => {
      const [group] = inbox([
        confirmed("cat-groceries"),
        confirmed("cat-dining"),
        row({ suggestedCategoryId: "cat-dining" }),
      ]).groups;

      expect(group.suggestion).toBeNull();
      expect(group.rows).toHaveLength(1);
    });

    it("never apply themselves: a suggested row stays in review", () => {
      const result = inbox([confirmed("cat-groceries"), row({ id: "open" })]);

      expect(result.left).toBe(1);
      expect(result.groups[0].rows[0]).toMatchObject({
        id: "open",
        categoryId: null,
        needsReview: true,
      });
    });

    it("give a No Merchant row its own stored value", () => {
      const [only] = inbox([
        row({ description: "", suggestedCategoryId: "cat-dining" }),
      ]).noMerchant;

      expect(only.suggestion).toEqual({ categoryId: "cat-dining", name: "Dining" });
    });

    it("give a No Merchant row nothing from past categories", () => {
      const [only] = inbox([
        confirmed("cat-groceries", { description: "" }),
        row({ description: "" }),
      ]).noMerchant;

      expect(only.suggestion).toBeNull();
    });

    it("show on the phone's group line", () => {
      const [suggested, plain] = inbox([
        confirmed("cat-groceries"),
        row(),
        row(),
        row({ description: "SAMPLE CAFE" }),
      ]).groups;

      expect(suggested.phoneDetail).toBe("2 rows · Suggested: Groceries");
      expect(plain.phoneDetail).toBe("1 row");
    });
  });

  describe("an empty inbox", () => {
    it("reads as done when every row is decided", () => {
      const result = inbox([confirmed("cat-groceries")]);

      expect(result.left).toBe(0);
      expect(result.subtitle).toBe("Nothing left to review.");
      expect(result.empty).toEqual({
        kind: "done",
        title: "All rows are reviewed",
        text: "New rows appear here after your next import.",
      });
    });

    it("says nothing is imported yet when there are no rows", () => {
      expect(inbox([]).empty).toEqual({
        kind: "nothing-imported",
        title: "Nothing to review yet",
        text: "Import a statement and any rows that need a decision appear here.",
      });
    });

    it("isn't empty while a row is left", () => {
      expect(inbox([row()]).empty).toBeNull();
    });

    it("isn't empty while a possible duplicate is left, with nothing to review", () => {
      const result = inbox([confirmed("cat-dining", { possibleDuplicate: true })]);

      expect(result.left).toBe(0);
      expect(result.empty).toBeNull();
    });
  });

  describe("possible transfers", () => {
    it("show opposite amounts on two accounts within 3 days as one match", () => {
      const result = inbox([
        moneyOut({ id: "out" }),
        moneyIn({ id: "in" }),
      ]);

      expect(result.transfers).toEqual([
        {
          key: "in,out",
          title: "Same Amount Within 3 Days",
          help: "These rows have opposite amounts on two accounts and no transfer number.",
          rows: [
            expect.objectContaining({ id: "in", account: "Joint Savings" }),
            expect.objectContaining({ id: "out", account: "Joint Checking" }),
          ],
          picked: ["in", "out"],
        },
      ]);
    });

    it("keep their rows out of merchant groups and No Merchant, still counted as left", () => {
      const result = inbox([
        moneyOut(),
        moneyIn({ description: "" }),
        row({ id: "grocer" }),
      ]);

      expect(result.groups.flatMap((group) => group.rows.map(({ id }) => id))).toEqual([
        "grocer",
      ]);
      expect(result.noMerchant).toEqual([]);
      expect(result.left).toBe(3);
    });

    it("hold a card payment with two candidates together, with none picked", () => {
      const amount = (minor: number) => ({
        amount: { minor, currency: "USD" },
        base: { minor, currency: "USD" },
      });
      const result = inbox([
        row({
          id: "payment",
          accountId: "acc-card",
          bankType: "Payment",
          postedOn: "2026-10-25",
          description: "PAYMENT THANK YOU",
          ...amount(81240),
        }),
        row({ id: "bank-a", postedOn: "2026-10-24", ...amount(-81240) }),
        row({ id: "bank-b", postedOn: "2026-10-26", ...amount(-81240) }),
      ]);

      expect(result.transfers).toEqual([
        expect.objectContaining({
          title: "Card Payment",
          help: "A card payment and a bank row have the same amount, within 5 days. Select the two rows that belong together.",
          picked: [],
        }),
      ]);
      expect(matchIds(result)).toEqual([["bank-b", "payment", "bank-a"]]);
    });

    it("include a stored transfer row with no pair, next to the rows in review", () => {
      const result = inbox([
        moneyOut({ id: "out" }),
        moneyIn({ id: "in", type: "transfer" }),
      ]);

      expect(result.transfers[0].rows).toEqual([
        expect.objectContaining({ id: "in", account: "Joint Savings", amount: "$500.00" }),
        expect.objectContaining({ id: "out", account: "Joint Checking", amount: "-$500.00" }),
      ]);
      expect(result.left).toBe(1);
    });

    it("leave out a match with no row in review", () => {
      const result = inbox([
        moneyOut({ type: "transfer" }),
        moneyIn({ type: "transfer" }),
      ]);

      expect(result.transfers).toEqual([]);
    });

    it("never hold a hidden row", () => {
      const result = inbox([moneyOut({ id: "out" }), moneyIn({ hidden: true })]);

      expect(result.transfers).toEqual([]);
      expect(result.groups[0].rows.map(({ id }) => id)).toEqual(["out"]);
    });

    it("let a row given another type leave the match", () => {
      const result = inbox([moneyOut({ id: "out" }), moneyIn({ type: "income" })]);

      expect(result.transfers).toEqual([]);
      expect(result.groups[0].rows.map(({ id }) => id)).toEqual(["out"]);
    });

    it("show a pair the evidence is sure of, picked, without pairing it", () => {
      const result = inbox([
        moneyOut({ id: "out", transferNumber: "TX-1" }),
        moneyIn({ id: "in", transferNumber: "TX-1" }),
      ]);

      expect(result.transfers).toEqual([
        expect.objectContaining({
          key: "in,out",
          title: "Same Transfer Number",
          help: "These rows share a transfer number.",
          picked: ["in", "out"],
        }),
      ]);
      expect(result.transfers[0].rows.map(({ paired }) => paired)).toEqual([
        false,
        false,
      ]);
    });

    it("list the newest match first", () => {
      const result = inbox([
        moneyOut({ id: "old-out" }),
        moneyIn({ id: "old-in" }),
        moneyOut({ id: "new-out", postedOn: "2026-10-20", amount: { minor: -7000, currency: "USD" } }),
        moneyIn({ id: "new-in", postedOn: "2026-10-21", amount: { minor: 7000, currency: "USD" } }),
      ]);

      expect(matchIds(result)).toEqual([
        ["new-in", "new-out"],
        ["old-in", "old-out"],
      ]);
    });

    it("leave out a match where no two rows can be one transfer, so its rows go back to review", () => {
      // A repeated transfer row in one file: same account, same number.
      const repeated = { transferNumber: "TX-9", description: "ONLINE TRANSFER" };
      const result = inbox([
        moneyOut({ id: "first", ...repeated }),
        moneyOut({ id: "repeat", ...repeated }),
      ]);

      expect(result.transfers).toEqual([]);
      expect(result.groups[0].rows.map(({ id }) => id).sort()).toEqual(["first", "repeat"]);
    });

    it("keep a larger match that holds a possible pair, with nothing picked", () => {
      const result = inbox([
        moneyOut({ id: "out", transferNumber: "TX-7" }),
        moneyOut({ id: "out-again", transferNumber: "TX-7" }),
        moneyIn({ id: "in", transferNumber: "TX-7" }),
      ]);

      expect(matchIds(result)).toEqual([["in", "out", "out-again"]]);
      expect(result.transfers[0].picked).toEqual([]);
    });

    it("never match EUR and USD rows", () => {
      const result = inbox([
        moneyOut(),
        moneyIn({
          accountId: "acc-de",
          amount: { minor: 50000, currency: "EUR" },
          base: { minor: 54000, currency: "USD" },
        }),
      ]);

      expect(result.transfers).toEqual([]);
    });
  });

  describe("possible duplicates", () => {
    it("list flagged rows that aren't hidden, in review or not, newest first", () => {
      const result = inbox([
        row({ id: "in-review", possibleDuplicate: true, postedOn: "2026-10-05" }),
        confirmed("cat-dining", {
          id: "decided",
          possibleDuplicate: true,
          postedOn: "2026-10-11",
        }),
        row({ id: "hidden", possibleDuplicate: true, hidden: true }),
        row({ id: "not-flagged" }),
      ]);

      expect(result.duplicates).toEqual([
        expect.objectContaining({ id: "decided", date: "Oct 11", category: "Dining" }),
        expect.objectContaining({ id: "in-review", date: "Oct 5" }),
      ]);
    });

    it("leave a row in review in its merchant group too", () => {
      const result = inbox([row({ id: "flagged", possibleDuplicate: true })]);

      expect(result.groups[0].rows.map(({ id }) => id)).toEqual(["flagged"]);
    });
  });

  it("lists the categories in the order given, for the pickers", () => {
    expect(inbox([]).categories).toEqual([
      { id: "cat-groceries", name: "Groceries" },
      { id: "cat-dining", name: "Dining" },
    ]);
  });
});
