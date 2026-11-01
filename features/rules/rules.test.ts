import { describe, expect, it } from "vitest";
import {
  ruleFromForm,
  rulesScreen,
  toCategoryRules,
  toMatchingRules,
  validateRule,
  type RuleDraft,
  type RuleRow,
} from "./rules";

const CATEGORIES = [
  { id: "cat-groceries", name: "Groceries" },
  { id: "cat-dining", name: "Dining" },
];

function row(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id: "rule-1",
    match_on: "descriptionContains",
    value: "SYNTHETIC SHOP",
    position: 0,
    type: "income",
    category_id: null,
    ...overrides,
  };
}

const typeRule = row({ id: "a", position: 1, value: "PAYROLL", type: "income" });
const categoryRule = row({
  id: "b",
  position: 0,
  value: "CORNER MARKET",
  type: null,
  category_id: "cat-groceries",
});

describe("toMatchingRules", () => {
  it("gives each rule's match and type, in position order", () => {
    expect(toMatchingRules([typeRule, categoryRule])).toEqual([
      {
        matchOn: "descriptionContains",
        value: "CORNER MARKET",
        type: "spending",
      },
      { matchOn: "descriptionContains", value: "PAYROLL", type: "income" },
    ]);
  });

  it("keeps a category rule in its place between type rules", () => {
    const rows = [
      row({ id: "x", position: 2, value: "LAST" }),
      row({
        id: "y",
        position: 1,
        value: "MIDDLE",
        type: null,
        category_id: "cat-dining",
      }),
      row({ id: "z", position: 0, value: "FIRST" }),
    ];

    expect(toMatchingRules(rows).map(({ value }) => value)).toEqual([
      "FIRST",
      "MIDDLE",
      "LAST",
    ]);
  });

  it("skips a row that gives neither, instead of throwing", () => {
    expect(toMatchingRules([row({ type: null, category_id: null })])).toEqual(
      [],
    );
  });
});

describe("toCategoryRules", () => {
  it("gives the category's name, in position order", () => {
    const rows = [
      row({
        id: "x",
        position: 1,
        value: "RIVERSIDE CAFE",
        type: null,
        category_id: "cat-dining",
      }),
      categoryRule,
    ];

    expect(toCategoryRules(rows, CATEGORIES)).toEqual([
      {
        matchOn: "descriptionContains",
        value: "CORNER MARKET",
        category: "Groceries",
      },
      {
        matchOn: "descriptionContains",
        value: "RIVERSIDE CAFE",
        category: "Dining",
      },
    ]);
  });

  it("leaves out rules with only a type", () => {
    expect(toCategoryRules([typeRule], CATEGORIES)).toEqual([]);
  });

  it("skips a row pointing at an unknown category, instead of throwing", () => {
    const orphan = row({ type: null, category_id: "cat-missing" });

    expect(toCategoryRules([orphan, categoryRule], CATEGORIES)).toEqual([
      {
        matchOn: "descriptionContains",
        value: "CORNER MARKET",
        category: "Groceries",
      },
    ]);
  });
});

describe("validateRule", () => {
  const VALID: RuleDraft = {
    match_on: "descriptionStartsWith",
    value: "CORNER MARKET",
    type: "spending",
    category_id: null,
  };

  it("accepts a type rule", () => {
    expect(validateRule(VALID)).toEqual({ ok: true, rule: VALID });
  });

  it("accepts a category rule", () => {
    const draft = { ...VALID, type: null, category_id: "cat-groceries" };

    expect(validateRule(draft)).toEqual({ ok: true, rule: draft });
  });

  it("removes space around the value", () => {
    expect(validateRule({ ...VALID, value: "  CORNER MARKET\n" })).toEqual({
      ok: true,
      rule: VALID,
    });
  });

  // Bank files wrap booking text with stray spaces, and stored IDs have none.
  it.each(["ppdId", "orderingPartyId"])(
    "removes every space from a %s value",
    (match_on) => {
      expect(
        validateRule({ ...VALID, match_on, value: " DE00ZZZ000 01234567\n" }),
      ).toEqual({
        ok: true,
        rule: { ...VALID, match_on, value: "DE00ZZZ00001234567" },
      });
    },
  );

  it("keeps the spaces inside a text value", () => {
    const draft = { ...VALID, match_on: "descriptionContains" };

    expect(validateRule(draft)).toEqual({ ok: true, rule: draft });
  });

  // The schema's filled_text check treats these as blank. They're code points
  // because they would be invisible as characters in this file.
  const WIDE_BLANKS = [
    0x00a0, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
    0xfeff,
  ].map((code) => String.fromCharCode(code));

  it.each([
    "",
    " ",
    "\t\n\v\f\r",
    ...WIDE_BLANKS,
    WIDE_BLANKS.join(""),
  ])("refuses a blank value: %j", (value) => {
    expect(validateRule({ ...VALID, value })).toEqual({
      ok: false,
      message: "Enter a value.",
    });
  });

  it("refuses an unknown match kind", () => {
    expect(validateRule({ ...VALID, match_on: "amount" })).toEqual({
      ok: false,
      message: "Select what this rule matches.",
    });
  });

  it("refuses a match kind inherited from Object", () => {
    expect(validateRule({ ...VALID, match_on: "constructor" })).toMatchObject({
      ok: false,
    });
  });

  it("refuses both a type and a category", () => {
    expect(
      validateRule({ ...VALID, type: "spending", category_id: "cat-groceries" }),
    ).toEqual({
      ok: false,
      message: "Select a type or a category, not both.",
    });
  });

  it("refuses neither a type nor a category", () => {
    expect(validateRule({ ...VALID, type: null })).toEqual({
      ok: false,
      message: "Select a type.",
    });
  });

  it("refuses an unknown type", () => {
    expect(validateRule({ ...VALID, type: "gift" })).toEqual({
      ok: false,
      message: "Select a type.",
    });
  });
});

describe("ruleFromForm", () => {
  const FORM = {
    matchOn: "descriptionContains",
    value: "CORNER MARKET",
    type: "spending",
    categoryId: "",
  };

  it("stores Spending with a category as a category rule", () => {
    expect(ruleFromForm({ ...FORM, categoryId: "cat-groceries" })).toEqual({
      match_on: "descriptionContains",
      value: "CORNER MARKET",
      type: null,
      category_id: "cat-groceries",
    });
  });

  it("stores Spending with No Category as a type rule", () => {
    expect(ruleFromForm(FORM)).toEqual({
      match_on: "descriptionContains",
      value: "CORNER MARKET",
      type: "spending",
      category_id: null,
    });
  });

  it("stores any other type as a type rule", () => {
    expect(ruleFromForm({ ...FORM, type: "saved" })).toMatchObject({
      type: "saved",
      category_id: null,
    });
  });

  it("drops a category left over from before the type changed", () => {
    expect(
      ruleFromForm({ ...FORM, type: "income", categoryId: "cat-groceries" }),
    ).toMatchObject({ type: "income", category_id: null });
  });
});

describe("rulesScreen", () => {
  const idRule = row({
    id: "id-rule",
    match_on: "ppdId",
    value: "000111222",
    position: 5,
    type: "income",
  });
  const secondIdRule = row({
    id: "party-rule",
    match_on: "orderingPartyId",
    value: "DE00ZZZ00000000001",
    position: 6,
    type: null,
    category_id: "cat-groceries",
  });
  const startsWith = row({
    id: "text-rule",
    match_on: "descriptionStartsWith",
    value: "CORNER MARKET",
    position: 0,
    type: "spending",
  });

  it("splits rules into ID and text groups, each in position order", () => {
    const screen = rulesScreen([secondIdRule, startsWith, idRule], CATEGORIES);

    expect(screen.idRules.map(({ value }) => value)).toEqual([
      "000111222",
      "DE00ZZZ00000000001",
    ]);
    expect(screen.textRules.map(({ value }) => value)).toEqual([
      "CORNER MARKET",
    ]);
  });

  it("labels what a rule matches and the type it gives", () => {
    const [item] = rulesScreen([idRule], CATEGORIES).idRules;

    expect(item).toMatchObject({
      matchLabel: "PPD ID",
      typeLabel: "Income",
      category: null,
    });
  });

  it("shows a category rule as Spending plus its category", () => {
    const [item] = rulesScreen([secondIdRule], CATEGORIES).idRules;

    expect(item).toMatchObject({
      matchLabel: "Ordering Party ID",
      typeLabel: "Spending",
      category: "Groceries",
    });
  });

  it("gives the values the edit form opens with", () => {
    const screen = rulesScreen([secondIdRule, startsWith], CATEGORIES);

    expect(screen.idRules[0].form).toEqual({
      matchOn: "orderingPartyId",
      value: "DE00ZZZ00000000001",
      type: "spending",
      categoryId: "cat-groceries",
    });
    expect(screen.textRules[0].form).toEqual({
      matchOn: "descriptionStartsWith",
      value: "CORNER MARKET",
      type: "spending",
      categoryId: "",
    });
  });

  it("still lists a rule pointing at an unknown category", () => {
    const orphan = row({ type: null, category_id: "cat-missing" });

    const [item] = rulesScreen([orphan], CATEGORIES).textRules;

    expect(item).toMatchObject({ typeLabel: "Spending", category: null });
    expect(item.form.categoryId).toBe("");
  });
});
