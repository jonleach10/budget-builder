import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { rulesScreen, type RuleRow } from "./rules";
import { RulesScreen } from "./RulesScreen";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const TEXT_RULE: RuleRow = {
  id: "text-1",
  match_on: "descriptionStartsWith",
  value: "CORNER MARKET",
  position: 0,
  type: null,
  category_id: "cat-groceries",
};

const ID_RULE: RuleRow = {
  id: "id-1",
  match_on: "ppdId",
  value: "000111222",
  position: 7,
  type: "income",
  category_id: null,
};

const CATEGORIES = [{ id: "cat-groceries", name: "Groceries" }];

function render(rows: readonly RuleRow[] | null): string {
  const data = rows === null ? null : rulesScreen(rows, CATEGORIES);
  return renderToStaticMarkup(createElement(RulesScreen, { data }));
}

const FUTURE_IMPORTS =
  "Rules apply to future imports. Stored transactions don&#x27;t change.";

describe("RulesScreen", () => {
  it("shows ID rules before text rules, whatever their positions", () => {
    const html = render([TEXT_RULE, ID_RULE]);

    expect(html.indexOf("ID Rules")).toBeGreaterThan(-1);
    expect(html.indexOf("ID Rules")).toBeLessThan(html.indexOf("Text Rules"));
    expect(html.indexOf(ID_RULE.value)).toBeLessThan(
      html.indexOf(TEXT_RULE.value),
    );
  });

  it("shows what a rule matches, its value and what it gives", () => {
    const html = render([TEXT_RULE]);

    for (const text of ["Starts With", "CORNER MARKET", "Spending", "Groceries"]) {
      expect(html).toContain(text);
    }
  });

  it("uses a real table with column headers", () => {
    const html = render([TEXT_RULE]);

    for (const column of ["Match", "Value", "Gives", "Actions"]) {
      expect(html).toContain(`>${column}</th>`);
    }
  });

  it("gives every icon button a name, on the table and the phone cards", () => {
    const html = render([TEXT_RULE]);

    expect(html.match(/aria-label="Delete CORNER MARKET"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Move CORNER MARKET up"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Move CORNER MARKET down"/g)).toHaveLength(2);
  });

  it("says a lower rule can give the category when the first match has none", () => {
    const html = render([TEXT_RULE]);

    expect(html).toContain(
      "The first match gives the type. If it has no category, a lower rule can give one.",
    );
    expect(html).not.toContain("The first match wins");
  });

  it("says rules apply to future imports", () => {
    expect(render([TEXT_RULE])).toContain(FUTURE_IMPORTS);
  });

  it("explains where rules come from when there are none", () => {
    const html = render([]);

    expect(html).toContain("No Rules Yet");
    expect(html).toContain("correcting a row in the review inbox");
    expect(html).toContain(FUTURE_IMPORTS);
  });

  it("shows one main action at a time when there are no rules", () => {
    expect(render([]).match(/>Add Rule</g)).toHaveLength(1);
  });

  it("doesn't claim there are no rules when the read failed", () => {
    const html = render(null);

    expect(html).toContain("The rules can&#x27;t be loaded.");
    expect(html).not.toContain("No Rules Yet");
  });
});
