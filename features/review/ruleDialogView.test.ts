import { describe, expect, it } from "vitest";
import type { RuleForm, RuleRow } from "@/features/rules/rules";
import type { InboxRuleOffer, SortCandidate } from "./ruleFromCorrection";
import {
  offerText,
  ruleDialogView,
  storedRuleItem,
  valueHint,
  type RuleDialogView,
} from "./ruleDialogView";

let nextId = 0;

/** A made-up row waiting in the inbox. */
function candidate(extra: Partial<SortCandidate> = {}): SortCandidate {
  nextId += 1;
  return {
    id: `t${nextId}`,
    description: `PARCELPOINT MKTPL*${nextId}Q`,
    type: null,
    redacted: false,
    merchant: `description:PARCELPOINT MKTPL*${nextId}Q`,
    country: "US",
    date: `Oct ${nextId % 28 + 1}`,
    account: "Sandbox Card",
    amount: "-$41.50",
    ...extra,
  };
}

const FORM: RuleForm = {
  matchOn: "descriptionStartsWith",
  value: "PARCELPOINT MKTPL*7Q2LM1",
  type: "spending",
  categoryId: "cat-shopping",
};

function offer(extra: Partial<InboxRuleOffer> = {}): InboxRuleOffer {
  return {
    form: FORM,
    codeInText: true,
    sourceId: "source",
    source: { description: "PARCELPOINT MKTPL*7Q2LM1" },
    name: "PARCELPOINT MKTPL*7Q2LM1",
    count: 1,
    gives: { typeLabel: "Spending", category: "Shopping" },
    rules: [],
    candidates: [],
    ...extra,
  };
}

const SHORT = { ...FORM, value: "PARCELPOINT MKTPL" };

function sortOf(view: RuleDialogView) {
  return view.kind === "earlier" ? undefined : view.sort;
}

describe("storedRuleItem", () => {
  it("gives Edit Earlier Rule the stored rule's form", () => {
    const earlier: RuleRow = {
      id: "rule-1",
      match_on: "descriptionContains",
      value: "PARCEL",
      position: 0,
      type: null,
      category_id: "cat-gifts",
    };
    const categories = [{ id: "cat-gifts", name: "Gifts" }];

    expect(storedRuleItem(offer({ rules: [earlier] }), categories, "rule-1")).toMatchObject({
      id: "rule-1",
      form: { matchOn: "descriptionContains", value: "PARCEL", categoryId: "cat-gifts" },
    });
    expect(storedRuleItem(offer(), categories, "rule-1")).toBeNull();
  });
});

describe("offerText", () => {
  it("names the rows saved and asks about a rule", () => {
    expect(offerText(offer())).toBe("saved for 1 row. Add a rule so future imports do the same?");
    expect(offerText(offer({ count: 1206 }))).toBe(
      "saved for 1,206 rows. Add a rule so future imports do the same?",
    );
  });
});

describe("valueHint", () => {
  it("asks for shorter text when the offer came from a code", () => {
    expect(valueHint("descriptionStartsWith", true)).toBe(
      "Shorten the text so later purchases match. Case doesn't matter.",
    );
  });

  it("gives the general hint for text with no code", () => {
    expect(valueHint("descriptionContains", false)).toBe(
      "Case doesn't matter. Shorten the text to match more rows.",
    );
  });

  it("says an ID must match exactly", () => {
    expect(valueHint("ppdId", true)).toBe("An ID must match exactly.");
    expect(valueHint("orderingPartyId", false)).toBe("An ID must match exactly.");
  });
});

describe("ruleDialogView", () => {
  it("opens with nothing to sort, as the accepted group held every exact match", () => {
    expect(ruleDialogView(offer({ candidates: [candidate()] }), FORM)).toEqual({
      kind: "new",
      sort: null,
    });
  });

  it("counts the rows the shortened rule would sort, from one country", () => {
    const rows = Array.from({ length: 7 }, () => candidate());
    const view = ruleDialogView(offer({ candidates: rows }), SHORT);
    const sort = sortOf(view);

    expect(view.kind).toBe("new");
    expect(sort).toMatchObject({
      count: 7,
      checkLabel: "Also sort 7 rows in review",
      detail: "From 7 merchant groups, all in US accounts.",
      bothCountries: false,
      more: "And 2 more.",
    });
    expect(sort?.preview).toHaveLength(5);
    expect(sort?.preview[0]).toEqual({
      id: rows[0].id,
      date: rows[0].date,
      description: rows[0].description,
      account: "Sandbox Card",
      amount: "-$41.50",
    });
  });

  it("says how many rows are in each country when both match", () => {
    const rows = [
      candidate({ merchant: "description:A" }),
      candidate({ merchant: "description:A" }),
      candidate({ country: "DE", merchant: "description:B" }),
    ];

    expect(sortOf(ruleDialogView(offer({ candidates: rows }), SHORT))).toMatchObject({
      checkLabel: "Also sort 3 rows in review",
      detail: "From 2 merchant groups: 2 rows in US accounts and 1 in Germany.",
      bothCountries: true,
      more: null,
    });
  });

  it("names German accounts when they're the only ones", () => {
    const view = ruleDialogView(
      offer({ candidates: [candidate({ country: "DE" })] }),
      SHORT,
    );

    expect(sortOf(view)).toMatchObject({
      checkLabel: "Also sort 1 row in review",
      detail: "From 1 merchant group, all in German accounts.",
    });
  });

  it("counts one group per bank text, so a code in each row means a group each", () => {
    // Shortened text matches 3 rows from 2 groups: the same text twice, one other.
    const rows = [
      candidate({ description: "PARCELPOINT MKTPL*AA1", merchant: "description:PARCELPOINT MKTPL*AA1" }),
      candidate({ description: "PARCELPOINT MKTPL*AA1", merchant: "description:PARCELPOINT MKTPL*AA1" }),
      candidate({ description: "PARCELPOINT MKTPL*BB2", merchant: "description:PARCELPOINT MKTPL*BB2" }),
    ];

    expect(sortOf(ruleDialogView(offer({ candidates: rows }), SHORT))?.detail).toBe(
      "From 2 merchant groups, all in US accounts.",
    );
  });

  it("counts one group per ID for an ID rule", () => {
    const idForm: RuleForm = { ...FORM, matchOn: "ppdId", value: "000111222" };
    const rows = [
      candidate({ description: "SAMPLE UTILITY CO", ppdId: "000111222", merchant: "ppdId:000111222" }),
      candidate({ description: "SAMPLE UTILITY CO WEB", ppdId: "000111222", merchant: "ppdId:000111222" }),
    ];
    const idOffer = offer({
      candidates: rows,
      source: { description: "SAMPLE UTILITY CO", ppdId: "999" },
    });

    expect(sortOf(ruleDialogView(idOffer, idForm))?.detail).toBe(
      "From 1 merchant group, all in US accounts.",
    );
  });

  it("counts No Merchant rows by their tab's name", () => {
    const loose = candidate({ description: "PARCELPOINT MKTPL / 1", merchant: "row:loose" });
    const grouped = candidate();

    expect(sortOf(ruleDialogView(offer({ candidates: [loose] }), SHORT))?.detail).toBe(
      "From 1 No Merchant row, all in US accounts.",
    );
    expect(
      sortOf(ruleDialogView(offer({ candidates: [grouped, loose] }), SHORT))?.detail,
    ).toBe("From 1 merchant group and 1 No Merchant row, all in US accounts.");
  });

  it("names an earlier rule that decides the row first", () => {
    const earlier: RuleRow = {
      id: "rule-1",
      match_on: "descriptionStartsWith",
      value: "PARCELPOINT",
      position: 0,
      type: "spending",
      category_id: null,
    };

    expect(
      ruleDialogView(offer({ rules: [earlier], candidates: [candidate()] }), SHORT),
    ).toEqual({
      kind: "earlier",
      ruleId: "rule-1",
      matchLabel: "Starts With",
      value: "PARCELPOINT",
      typeLabel: "Spending",
      category: null,
    });
  });

  it("says the same rule exists, and counts the rows it would sort", () => {
    const same: RuleRow = {
      id: "rule-1",
      match_on: "descriptionStartsWith",
      value: "parcelpoint mktpl",
      position: 0,
      type: null,
      category_id: "cat-shopping",
    };
    const rows = [candidate(), candidate()];

    expect(ruleDialogView(offer({ rules: [same], candidates: rows }), SHORT)).toMatchObject({
      kind: "exists",
      ruleId: "rule-1",
      text: "This rule already exists, so it won't be added again. A rule sorts only rows imported after it, so 2 rows that match it are still in review.",
      sortLabel: "Sort 2 Rows",
      sort: { count: 2, detail: "From 2 merchant groups, all in US accounts." },
    });
  });

  it("says only that the rule exists when no row in review matches it", () => {
    const same: RuleRow = {
      id: "rule-1",
      match_on: "descriptionStartsWith",
      value: "PARCELPOINT MKTPL",
      position: 0,
      type: null,
      category_id: "cat-shopping",
    };

    expect(ruleDialogView(offer({ rules: [same] }), SHORT)).toEqual({
      kind: "exists",
      ruleId: "rule-1",
      text: "This rule already exists, so it won't be added again.",
      sortLabel: null,
      sort: null,
    });
  });

  it("sorts nothing while the value is blank", () => {
    expect(
      ruleDialogView(offer({ candidates: [candidate()] }), { ...FORM, value: "  " }),
    ).toEqual({ kind: "new", sort: null });
  });
});
