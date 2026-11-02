import { describe, expect, it } from "vitest";
import {
  clearFilters,
  filterLines,
  NO_FILTERS,
  showsCategoryFilter,
  transactionsView,
  withType,
  type TransactionFilters,
} from "./filterTransactions";
import type { TransactionLine } from "./transactionsScreenData";

function line(extra: Partial<TransactionLine> = {}): TransactionLine {
  return {
    id: "t1",
    date: "Oct 3",
    title: "SAMPLE GROCER",
    bankText: null,
    purpose: null,
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
    hidden: false,
    ...extra,
  };
}

function filters(extra: Partial<TransactionFilters>): TransactionFilters {
  return { ...NO_FILTERS, ...extra };
}

function idsOf(lines: readonly TransactionLine[]): string[] {
  return lines.map(({ id }) => id);
}

describe("filterLines", () => {
  it("keeps every row that isn't hidden when no filter is set", () => {
    const lines = [line({ id: "a" }), line({ id: "b", type: null })];

    expect(idsOf(filterLines(lines, NO_FILTERS))).toEqual(["a", "b"]);
  });

  it("keeps the order it was given", () => {
    const lines = [line({ id: "z" }), line({ id: "a" })];

    expect(idsOf(filterLines(lines, NO_FILTERS))).toEqual(["z", "a"]);
  });

  it("filters by account", () => {
    const lines = [
      line({ id: "us", accountId: "acc-us" }),
      line({ id: "de", accountId: "acc-de" }),
    ];

    expect(idsOf(filterLines(lines, filters({ accountId: "acc-de" })))).toEqual(
      ["de"],
    );
  });

  it("filters by type", () => {
    const lines = [
      line({ id: "out", type: "spending" }),
      line({ id: "in", type: "income", categoryId: null }),
      line({ id: "open", type: null, categoryId: null }),
    ];

    expect(idsOf(filterLines(lines, filters({ type: "income" })))).toEqual([
      "in",
    ]);
  });

  it("filters by category when the type is spending", () => {
    const lines = [
      line({ id: "food", categoryId: "cat-groceries" }),
      line({ id: "cafe", categoryId: "cat-dining" }),
      line({ id: "open", categoryId: null }),
    ];

    expect(
      idsOf(
        filterLines(
          lines,
          filters({ type: "spending", categoryId: "cat-dining" }),
        ),
      ),
    ).toEqual(["cafe"]);
  });

  it("ignores a category when the type isn't spending", () => {
    const lines = [
      line({ id: "food", categoryId: "cat-groceries" }),
      line({ id: "cafe", categoryId: "cat-dining" }),
    ];

    expect(
      idsOf(filterLines(lines, filters({ categoryId: "cat-dining" }))),
    ).toEqual(["food", "cafe"]);
  });

  it("keeps only rows that need review when asked", () => {
    const lines = [
      line({ id: "done" }),
      line({ id: "open", needsReview: true }),
    ];

    expect(idsOf(filterLines(lines, filters({ needsReview: true })))).toEqual([
      "open",
    ]);
  });

  it("leaves hidden rows out unless asked for", () => {
    const lines = [line({ id: "shown" }), line({ id: "gone", hidden: true })];

    expect(idsOf(filterLines(lines, NO_FILTERS))).toEqual(["shown"]);
    expect(idsOf(filterLines(lines, filters({ showHidden: true })))).toEqual([
      "shown",
      "gone",
    ]);
  });

  it("applies every filter at once", () => {
    const lines = [
      line({ id: "match", accountId: "acc-de", needsReview: true }),
      line({ id: "other-account", needsReview: true }),
      line({ id: "reviewed", accountId: "acc-de" }),
    ];

    expect(
      idsOf(
        filterLines(lines, filters({ accountId: "acc-de", needsReview: true })),
      ),
    ).toEqual(["match"]);
  });

  describe("search", () => {
    const lines = [
      line({ id: "bank", title: "CORNER MARKET" }),
      line({ id: "purpose", title: "SAMPLE GIRO", purpose: "Rent for October" }),
      line({ id: "label", title: "Landlord", bankText: "[REDACTED]" }),
      line({ id: "plain", title: "RIVERSIDE CAFE" }),
    ];

    const found = (search: string) =>
      idsOf(filterLines(lines, filters({ search })));

    it("covers the description, ignoring case", () => {
      expect(found("corner")).toEqual(["bank"]);
    });

    it("covers the purpose, ignoring case", () => {
      expect(found("RENT")).toEqual(["purpose"]);
    });

    it("covers the label, ignoring case", () => {
      expect(found("landLORD")).toEqual(["label"]);
    });

    it("covers the bank text under a label", () => {
      expect(found("redacted")).toEqual(["label"]);
    });

    it("ignores spaces around the search and matches letters with umlauts", () => {
      const german = [line({ id: "de", title: "BÄCKEREI SAMPLE" })];

      expect(
        idsOf(filterLines(german, filters({ search: "  bäckerei " }))),
      ).toEqual(["de"]);
    });

    it("treats a search of only spaces as no search", () => {
      expect(found("   ")).toEqual(["bank", "purpose", "label", "plain"]);
    });

    it("finds nothing for text in no row", () => {
      expect(found("nothing like this")).toEqual([]);
    });
  });
});

describe("showsCategoryFilter", () => {
  it("is true only when the type is spending", () => {
    expect(showsCategoryFilter(filters({ type: "spending" }))).toBe(true);
    expect(showsCategoryFilter(filters({ type: "income" }))).toBe(false);
    expect(showsCategoryFilter(NO_FILTERS)).toBe(false);
  });
});

describe("withType", () => {
  it("sets the type and clears the category", () => {
    const start = filters({ type: "spending", categoryId: "cat-dining" });

    expect(withType(start, "income")).toEqual(filters({ type: "income" }));
  });

  it("leaves the other filters alone", () => {
    const start = filters({ search: "cafe", accountId: "acc-us" });

    expect(withType(start, "spending")).toEqual({
      ...start,
      type: "spending",
    });
  });
});

describe("clearFilters", () => {
  it("clears the search, account, type, category and needs review", () => {
    const start = filters({
      search: "cafe",
      accountId: "acc-us",
      type: "spending",
      categoryId: "cat-dining",
      needsReview: true,
    });

    expect(clearFilters(start)).toEqual(NO_FILTERS);
  });

  it("keeps Show Hidden as it was, like the approved design", () => {
    const start = filters({ search: "cafe", showHidden: true });

    expect(clearFilters(start)).toEqual(filters({ showHidden: true }));
  });
});

describe("transactionsView", () => {
  const month = "2026-10";

  it("counts the rows left after filtering", () => {
    const lines = [
      line({ id: "a", accountId: "acc-us" }),
      line({ id: "b", accountId: "acc-us" }),
      line({ id: "c", accountId: "acc-de" }),
    ];

    expect(transactionsView(lines, NO_FILTERS, month).subtitle).toBe(
      "3 rows in October 2026.",
    );
    expect(
      transactionsView(lines, filters({ accountId: "acc-de" }), month).subtitle,
    ).toBe("1 row in October 2026.");
  });

  it("groups a long count with a comma", () => {
    const lines = Array.from({ length: 1200 }, (_, index) =>
      line({ id: `row-${index}` }),
    );

    expect(transactionsView(lines, NO_FILTERS, month).subtitle).toBe(
      "1,200 rows in October 2026.",
    );
  });

  it("has no empty state while rows show", () => {
    expect(transactionsView([line()], NO_FILTERS, month).empty).toBeNull();
  });

  it("calls a month with no rows an empty month, whatever the filters", () => {
    const expected = {
      kind: "month",
      title: "No rows in March 2026",
      text: "Import a statement that covers this month to see its rows.",
    };

    expect(transactionsView([], NO_FILTERS, "2026-03").empty).toEqual(expected);
    expect(
      transactionsView([], filters({ search: "cafe" }), "2026-03").empty,
    ).toEqual(expected);
  });

  it("tells filters with no results apart from an empty month", () => {
    const view = transactionsView(
      [line()],
      filters({ search: "nothing like this" }),
      month,
    );

    expect(view.lines).toEqual([]);
    expect(view.empty).toEqual({
      kind: "filters",
      title: "No rows match these filters",
    });
  });

  it("says when every row in the month is hidden", () => {
    const view = transactionsView([line({ hidden: true })], NO_FILTERS, month);

    expect(view.empty).toEqual({
      kind: "all-hidden",
      title: "All rows in October 2026 are hidden",
      text: "Select Show Hidden to see them.",
    });
  });

  it("calls it a filter result when a filter is set on a hidden month", () => {
    const view = transactionsView(
      [line({ hidden: true })],
      filters({ needsReview: true }),
      month,
    );

    expect(view.empty).toMatchObject({ kind: "filters" });
  });
});
