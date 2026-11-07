import { describe, expect, it } from "vitest";
import { matchesRule } from "@/features/categorize/matchRule";
import { merchantKey } from "@/features/categorize/pastCategories";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import {
  ruleFromForm,
  validateRule,
  type RuleRow,
  type ValidRule,
} from "@/features/rules/rules";
import {
  inboxRuleOffer,
  ruleConflict,
  ruleOffer,
  rowsRuleWouldSort,
  sortCandidates,
  type SortCandidate,
} from "./ruleFromCorrection";

let nextId = 0;

/** A stored row, already saved by the accept: made up, like every row here. */
function row(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  nextId += 1;
  return {
    id: `t${nextId}`,
    accountId: "acc-card",
    fingerprint: `fingerprint-${nextId}`,
    postedOn: "2026-10-03",
    amount: { minor: -4150, currency: "USD" },
    base: { minor: -4150, currency: "USD" },
    description: "PARCELPOINT MKTPL*7Q2LM1",
    type: "spending",
    categoryId: "cat-shopping",
    categorySource: "manual",
    suggestedCategoryId: null,
    note: null,
    hidden: false,
    possibleDuplicate: false,
    transferPairId: null,
    ...extra,
  };
}

const SHOPPING = { categoryId: "cat-shopping" };
const TRANSFER = { type: "transfer" as const };

describe("ruleOffer", () => {
  describe("offers a rule", () => {
    it("for a category on text with a code that changes with each purchase", () => {
      const offer = ruleOffer(row(), SHOPPING, []);

      expect(offer).toEqual({
        form: {
          matchOn: "descriptionStartsWith",
          value: "PARCELPOINT MKTPL*7Q2LM1",
          type: "spending",
          categoryId: "cat-shopping",
        },
        codeInText: true,
      });
    });

    it.each([
      ["a digit", "SAMPLE COFFEE 118"],
      ["a star", "SQ *SAMPLE KIOSK"],
      ["a hash", "SAMPLE GROCER #A"],
    ])("when the text holds %s", (_kind, description) => {
      expect(ruleOffer(row({ description }), SHOPPING, [])?.codeInText).toBe(true);
    });

    it.each(["income", "transfer", "saved", "personal"] as const)(
      "for the %s type, even on text with no code",
      (type) => {
        const source = row({
          description: "SAMPLE CARD AUTOPAY",
          type,
          categoryId: null,
          categorySource: null,
        });

        expect(ruleOffer(source, { type }, [])).toEqual({
          form: {
            matchOn: "descriptionStartsWith",
            value: "SAMPLE CARD AUTOPAY",
            type,
            categoryId: "",
          },
          codeInText: false,
        });
      },
    );

    it("as an ID rule for a type on a row with a PPD ID", () => {
      const source = row({
        description: "SAMPLE LANDLORD",
        ppdId: "000111222",
        type: "personal",
        categoryId: null,
      });

      expect(ruleOffer(source, { type: "personal" }, [])?.form).toEqual({
        matchOn: "ppdId",
        value: "000111222",
        type: "personal",
        categoryId: "",
      });
    });

    it("as an ID rule for a type on a row with an Ordering Party ID", () => {
      const source = row({
        description: "SAMPLE SPORTVEREIN 2026",
        orderingPartyId: "DE00ZZZ00000000001",
        type: "personal",
        categoryId: null,
      });

      const offer = ruleOffer(source, { type: "personal" }, []);

      expect(offer?.form).toEqual({
        matchOn: "orderingPartyId",
        value: "DE00ZZZ00000000001",
        type: "personal",
        categoryId: "",
      });
      expect(offer?.codeInText).toBe(false);
    });

    it("from the bank text, not the owner's label", () => {
      const source = row({ note: "Parcel shop" });

      expect(ruleOffer(source, SHOPPING, [])?.form.value).toBe(
        "PARCELPOINT MKTPL*7Q2LM1",
      );
    });
  });

  describe("offers nothing", () => {
    it("for a category on text with no code, which past categories cover", () => {
      expect(ruleOffer(row({ description: "CORNER MARKET" }), SHOPPING, [])).toBeNull();
    });

    it("for a category on a group keyed on a PPD ID", () => {
      const source = row({ description: "SAMPLE UTILITY CO 0042", ppdId: "000111222" });
      expect(ruleOffer(source, SHOPPING, [])).toBeNull();
    });

    it("for a category on a group keyed on an Ordering Party ID", () => {
      const source = row({
        description: "SAMPLE INSURANCE 2026",
        orderingPartyId: "DE00ZZZ00000000002",
      });
      expect(ruleOffer(source, SHOPPING, [])).toBeNull();
    });

    it("for a redacted group, even with a type", () => {
      const source = row({
        description: "Erstattung [REDACTED] 15",
        type: "transfer",
        categoryId: null,
      });
      expect(ruleOffer(source, TRANSFER, [])).toBeNull();
      expect(ruleOffer(row({ description: "Erstattung [REDACTED] 15" }), SHOPPING, [])).toBeNull();
    });

    it("for a row with no merchant key", () => {
      const source = row({ description: "[REDACTED] / [REDACTED]", type: "transfer" });
      expect(ruleOffer(source, TRANSFER, [])).toBeNull();
    });

    it("for a merchant that's mixed after this accept", () => {
      const source = row();
      const key = merchantKey(source) as string;

      expect(ruleOffer(source, SHOPPING, [key])).toBeNull();
      expect(ruleOffer(source, TRANSFER, [key])).toBeNull();
    });

    it("for Spending with no category", () => {
      expect(ruleOffer(row(), { type: "spending" }, [])).toBeNull();
    });

    it("for an edit that's only a label or a hidden flag", () => {
      expect(ruleOffer(row(), { label: "Parcel shop" }, [])).toBeNull();
      expect(ruleOffer(row(), { hidden: true }, [])).toBeNull();
    });
  });

  describe("the value it fills in", () => {
    const kinds: [string, Partial<StoredTransaction>, object][] = [
      ["Chase card text with a code", { description: "PARCELPOINT MKTPL*7Q2LM1" }, SHOPPING],
      ["Chase bank text with a PPD ID", { description: "SAMPLE PAYROLL DIRECT DEP", ppdId: "1234567891" }, { type: "income" }],
      ["Commerzbank text with an Ordering Party ID", { description: "MUSTER VERSICHERUNG Mandate Reference: M-123", orderingPartyId: "DE00ZZZ00001234567" }, TRANSFER],
      ["Commerzbank text with an umlaut and a code", { description: "Beispiel Bäckerei 0815" }, SHOPPING],
      ["text with doubled spaces", { description: "SAMPLE  SHOP   *T 11/05" }, SHOPPING],
    ];

    it.each(kinds)("matches its own row: %s", (_kind, fields, edit) => {
      const source = row(fields);
      const offer = ruleOffer(source, edit, []);
      if (offer === null) throw new Error("expected an offer");

      const check = validateRule(ruleFromForm(offer.form));
      if (!check.ok) throw new Error(check.message);
      expect(
        matchesRule({ matchOn: check.rule.match_on, value: check.rule.value }, source),
      ).toBe(true);
    });
  });
});

let nextRule = 0;

function rule(extra: Partial<RuleRow> = {}): RuleRow {
  nextRule += 1;
  return {
    id: `rule-${nextRule}`,
    match_on: "descriptionStartsWith",
    value: "PARCELPOINT MKTPL",
    position: nextRule,
    type: null,
    category_id: "cat-shopping",
    ...extra,
  };
}

const SHOPPING_RULE: ValidRule = {
  match_on: "descriptionStartsWith",
  value: "PARCELPOINT MKTPL",
  type: null,
  category_id: "cat-shopping",
};

describe("ruleConflict", () => {
  const source = row();

  it("finds none when no other rule matches the row", () => {
    const other = rule({ value: "CORNER MARKET" });
    expect(ruleConflict(SHOPPING_RULE, [other], source)).toBeNull();
  });

  it("finds the same rule, compared without case or extra spaces", () => {
    const same = rule({ value: "parcelpoint   mktpl" });

    expect(ruleConflict(SHOPPING_RULE, [same], source)).toEqual({
      kind: "exists",
      rule: same,
    });
  });

  it("finds the same ID rule", () => {
    const same = rule({ match_on: "ppdId", value: "000111222" });
    const draft = { ...SHOPPING_RULE, match_on: "ppdId", value: "000111222" } as const;
    const target = row({ ppdId: "000111222" });

    expect(ruleConflict(draft, [same], target)?.kind).toBe("exists");
  });

  it("names an earlier rule that decides the row first", () => {
    const earlier = rule({ value: "PARCELPOINT", type: "spending", category_id: null });

    expect(ruleConflict(SHOPPING_RULE, [earlier], source)).toEqual({
      kind: "earlier",
      rule: earlier,
    });
  });

  it("treats the same match with another outcome as an earlier rule", () => {
    const earlier = rule({ category_id: "cat-gifts" });
    expect(ruleConflict(SHOPPING_RULE, [earlier], source)?.kind).toBe("earlier");
  });

  it("puts an ID rule ahead of a new text rule", () => {
    const idRule = rule({ match_on: "ppdId", value: "000111222", position: 99 });
    const target = row({ description: "PARCELPOINT MKTPL", ppdId: "000111222" });

    expect(ruleConflict(SHOPPING_RULE, [idRule], target)).toEqual({
      kind: "earlier",
      rule: idRule,
    });
  });

  it("puts a new ID rule ahead of every text rule", () => {
    const textRule = rule({ value: "SAMPLE LANDLORD", type: "transfer", category_id: null });
    const draft: ValidRule = {
      match_on: "ppdId",
      value: "000111222",
      type: "personal",
      category_id: null,
    };
    const target = row({ description: "SAMPLE LANDLORD", ppdId: "000111222" });

    expect(ruleConflict(draft, [textRule], target)).toBeNull();
  });

  it("finds none when the new rule no longer matches its row", () => {
    const draft = { ...SHOPPING_RULE, value: "SOMETHING ELSE" };
    const unrelated = rule({ value: "CORNER" });

    expect(ruleConflict(draft, [unrelated], source)).toBeNull();
  });
});

/** A row the inbox lists under Merchants, with nothing decided. */
function candidate(extra: Partial<SortCandidate> = {}): SortCandidate {
  nextId += 1;
  return {
    id: `t${nextId}`,
    description: `PARCELPOINT MKTPL*${nextId}X`,
    type: null,
    redacted: false,
    merchant: `description:PARCELPOINT MKTPL*${nextId}X`,
    country: "US",
    date: "Oct 26",
    account: "Sandbox Card",
    amount: "-$41.50",
    ...extra,
  };
}

function ids(rows: readonly SortCandidate[]): string[] {
  return rows.map(({ id }) => id);
}

const TRANSFER_RULE: ValidRule = {
  match_on: "descriptionStartsWith",
  value: "SAMPLE CARD AUTOPAY",
  type: "transfer",
  category_id: null,
};

describe("rowsRuleWouldSort", () => {
  it("sorts every row in review the new rule matches", () => {
    const a = candidate({ id: "a" });
    const b = candidate({ id: "b", type: "spending" });
    const other = candidate({ id: "other", description: "CORNER MARKET" });

    expect(ids(rowsRuleWouldSort(SHOPPING_RULE, [], [a, b, other]))).toEqual([
      "a",
      "b",
    ]);
  });

  it("leaves out redacted rows", () => {
    const redacted = candidate({
      id: "redacted",
      description: "PARCELPOINT MKTPL*[REDACTED]",
      redacted: true,
    });
    expect(rowsRuleWouldSort(SHOPPING_RULE, [], [redacted])).toEqual([]);
  });

  it("leaves out rows with a transfer number, unless the rule gives Transfer", () => {
    const numbered = { transferNumber: "20261000001" };

    expect(
      rowsRuleWouldSort(SHOPPING_RULE, [], [candidate(numbered)]),
    ).toEqual([]);
    expect(
      rowsRuleWouldSort(TRANSFER_RULE, [], [
        candidate({ ...numbered, id: "card", description: "SAMPLE CARD AUTOPAY" }),
      ]).map(({ id }) => id),
    ).toEqual(["card"]);
  });

  it("leaves out rows where an earlier rule wins", () => {
    const earlier = rule({ value: "PARCELPOINT MKTPL*1", category_id: "cat-gifts" });
    const decided = candidate({ id: "decided", description: "PARCELPOINT MKTPL*1Q" });
    const free = candidate({ id: "free", description: "PARCELPOINT MKTPL*2Q" });

    expect(ids(rowsRuleWouldSort(SHOPPING_RULE, [earlier], [decided, free]))).toEqual([
      "free",
    ]);
  });

  it("leaves out rows an ID rule wins, as ID rules are tried first", () => {
    const idRule = rule({ match_on: "ppdId", value: "000111222", position: 50 });
    const withId = candidate({ id: "with-id", ppdId: "000111222" });

    expect(rowsRuleWouldSort(SHOPPING_RULE, [idRule], [withId])).toEqual([]);
  });

  it("sorts rows a later stored rule would have matched", () => {
    const later = rule({ value: "PARCELPOINT", category_id: "cat-gifts", position: 1 });
    const draft = { ...SHOPPING_RULE };
    // The new rule goes last, so a stored rule that matches always wins.
    expect(rowsRuleWouldSort(draft, [later], [candidate()])).toEqual([]);
  });

  it("gives a type rule only rows with no type", () => {
    const none = candidate({ id: "none", description: "SAMPLE CARD AUTOPAY" });
    const spending = candidate({
      id: "spending",
      description: "SAMPLE CARD AUTOPAY",
      type: "spending",
    });

    expect(ids(rowsRuleWouldSort(TRANSFER_RULE, [], [none, spending]))).toEqual([
      "none",
    ]);
  });

  it("gives a category rule rows with no type and Spending rows", () => {
    const none = candidate({ id: "none" });
    const spending = candidate({ id: "spending", type: "spending" });

    expect(ids(rowsRuleWouldSort(SHOPPING_RULE, [], [none, spending]))).toEqual([
      "none",
      "spending",
    ]);
  });

  it("sorts nothing for Spending with no category, which sends rows to review", () => {
    const review: ValidRule = { ...SHOPPING_RULE, type: "spending", category_id: null };
    expect(rowsRuleWouldSort(review, [], [candidate()])).toEqual([]);
  });

  it("works out a stored rule's rows with every other rule in place", () => {
    const stored = rule({ id: "stored", position: 5 });
    const earlier = rule({ value: "PARCELPOINT MKTPL*1", position: 1 });
    const decided = candidate({ id: "decided", description: "PARCELPOINT MKTPL*1Q" });
    const free = candidate({ id: "free" });

    expect(
      ids(rowsRuleWouldSort(stored, [earlier, stored], [decided, free])),
    ).toEqual(["free"]);
  });

  it("never matches on the owner's label", () => {
    const labelled = candidate({ id: "labelled", description: "SQ *SAMPLE KIOSK" });
    const byLabel: ValidRule = { ...SHOPPING_RULE, value: "Parcel shop" };

    expect(rowsRuleWouldSort(byLabel, [], [labelled])).toEqual([]);
  });
});

const ACCOUNTS = [
  { id: "acc-card", name: "Sandbox Card", country: "US" as const },
  { id: "acc-de", name: "Sandbox Girokonto", country: "DE" as const },
  { id: "acc-savings", name: "Sandbox Savings", country: "US" as const },
  { id: "acc-checking", name: "Sandbox Checking", country: "US" as const },
];

function source(rows: StoredTransaction[]) {
  return {
    rows,
    accounts: ACCOUNTS,
    pairingAccounts: [
      { id: "acc-card", format: "chase-card" as const },
      { id: "acc-de", format: "commerzbank" as const },
      { id: "acc-savings", format: "chase-bank" as const },
      { id: "acc-checking", format: "chase-bank" as const },
    ],
    categories: [{ id: "cat-shopping", name: "Shopping", position: 0 }],
    thisMonth: "2026-11",
  };
}

/** A stored row in review: no type, no category. */
function inReview(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  return row({ type: null, categoryId: null, categorySource: null, ...extra });
}

describe("sortCandidates", () => {
  it("holds the rows of the merchant groups and the No Merchant list", () => {
    const grouped = inReview({ id: "grouped" });
    const spending = inReview({ id: "spending", type: "spending" });
    const noMerchant = inReview({ id: "no-merchant", description: "[REDACTED]" });

    expect(ids(sortCandidates(source([grouped, spending, noMerchant]))).sort()).toEqual([
      "grouped",
      "no-merchant",
      "spending",
    ]);
  });

  it("leaves out rows that aren't in review", () => {
    const sorted = row({ id: "sorted" });
    const hidden = inReview({ id: "hidden", hidden: true });
    const typed = inReview({ id: "typed", type: "income" });

    expect(sortCandidates(source([sorted, hidden, typed]))).toEqual([]);
  });

  it("leaves out rows in a possible transfer", () => {
    const out = inReview({
      id: "out",
      accountId: "acc-savings",
      description: "SAMPLE WIRE OUT",
      amount: { minor: -75000, currency: "USD" },
      base: { minor: -75000, currency: "USD" },
    });
    const back = inReview({
      id: "back",
      accountId: "acc-checking",
      description: "SAMPLE DEPOSIT",
      amount: { minor: 75000, currency: "USD" },
      base: { minor: 75000, currency: "USD" },
    });

    expect(ids(sortCandidates(source([out, back])))).toEqual([]);
  });

  it("lists rows newest first, whatever group they're in", () => {
    const old = inReview({ id: "old", postedOn: "2026-07-10", description: "A 1" });
    const recent = inReview({ id: "recent", postedOn: "2026-10-22", description: "B 2" });
    const middle = inReview({ id: "middle", postedOn: "2026-09-16", description: "C 3" });

    expect(ids(sortCandidates(source([old, recent, middle])))).toEqual([
      "recent",
      "middle",
      "old",
    ]);
  });

  it("includes a possible duplicate, as accepting its group does", () => {
    const duplicate = inReview({ id: "duplicate", possibleDuplicate: true });
    expect(ids(sortCandidates(source([duplicate])))).toEqual(["duplicate"]);
  });

  it("carries what the count and Show Rows need, and no row text it doesn't", () => {
    const german = inReview({
      id: "german",
      accountId: "acc-de",
      postedOn: "2026-10-26",
      description: "Beispiel Bäckerei 0815",
      purpose: "Brötchen",
      amount: { minor: -2100, currency: "EUR" },
      base: { minor: -2299, currency: "USD" },
      transferNumber: "20261000001",
      note: "Bakery",
    });

    expect(sortCandidates(source([german]))).toEqual([
      {
        id: "german",
        description: "Beispiel Bäckerei 0815",
        transferNumber: "20261000001",
        type: null,
        redacted: false,
        merchant: "description:BEISPIEL BÄCKEREI 0815",
        country: "DE",
        date: "Oct 26",
        account: "Sandbox Girokonto",
        amount: "-$22.99",
      },
    ]);
  });
});

describe("inboxRuleOffer", () => {
  const older = row({ id: "older", postedOn: "2026-10-01" });
  const newest = row({ id: "newest", postedOn: "2026-10-20", description: older.description });
  const waiting = inReview({ id: "waiting", description: "PARCELPOINT MKTPL*K81ZT0" });

  it("fills the dialog in from the accepted group's newest row", () => {
    const stored = rule({ value: "CORNER MARKET" });
    const offer = inboxRuleOffer(source([older, newest, waiting]), [stored], ["older", "newest"], SHOPPING);

    expect(offer).toMatchObject({
      sourceId: "newest",
      source: { description: "PARCELPOINT MKTPL*7Q2LM1" },
      name: "PARCELPOINT MKTPL*7Q2LM1",
      count: 2,
      form: { value: "PARCELPOINT MKTPL*7Q2LM1", categoryId: "cat-shopping" },
      codeInText: true,
      gives: { typeLabel: "Spending", category: "Shopping" },
      rules: [stored],
    });
    expect(offer?.candidates.map(({ id }) => id)).toEqual(["waiting"]);
  });

  it("names a type for a type rule", () => {
    const transfer = row({
      id: "autopay",
      description: "SAMPLE CARD AUTOPAY",
      type: "transfer",
      categoryId: null,
      categorySource: null,
    });

    expect(
      inboxRuleOffer(source([transfer]), [], ["autopay"], TRANSFER)?.gives,
    ).toEqual({ typeLabel: "Transfer", category: null });
  });

  it("offers nothing for a merchant this accept made mixed", () => {
    const earlier = row({ id: "earlier", categoryId: "cat-gifts", description: older.description });
    const rows = [earlier, older, newest];
    const categories = [
      { id: "cat-shopping", name: "Shopping", position: 0 },
      { id: "cat-gifts", name: "Gifts", position: 1 },
    ];

    expect(
      inboxRuleOffer({ ...source(rows), categories }, [], ["older", "newest"], SHOPPING),
    ).toBeNull();
  });

  it("offers nothing for a type on a merchant with confirmed categories", () => {
    // From the review probe: two past Groceries rows, then the group as Transfer.
    const past = [
      row({ id: "p1", postedOn: "2026-08-01", description: "SAMPLE GROCER" }),
      row({ id: "p2", postedOn: "2026-09-01", description: "SAMPLE GROCER" }),
    ];
    const acceptedRows = [
      row({ id: "a1", description: "SAMPLE GROCER", type: "transfer", categoryId: null, categorySource: null }),
      row({ id: "a2", description: "SAMPLE GROCER", type: "transfer", categoryId: null, categorySource: null }),
    ];

    expect(
      inboxRuleOffer(source([...past, ...acceptedRows]), [], ["a1", "a2"], TRANSFER),
    ).toBeNull();
  });

  it("still offers a type when the merchant's past categories weren't confirmed", () => {
    const byRule = row({ id: "p1", description: "SAMPLE GROCER", categorySource: "rule" });
    const acceptedRow = row({
      id: "a1",
      description: "SAMPLE GROCER",
      type: "transfer",
      categoryId: null,
      categorySource: null,
    });

    expect(
      inboxRuleOffer(source([byRule, acceptedRow]), [], ["a1"], TRANSFER)?.form.type,
    ).toBe("transfer");
  });

  it("offers nothing when no accepted row is stored", () => {
    expect(inboxRuleOffer(source([waiting]), [], ["gone"], SHOPPING)).toBeNull();
  });
});
