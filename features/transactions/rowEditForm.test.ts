import { describe, expect, it } from "vitest";
import {
  editFrom,
  pairWarning,
  rowForm,
  withFormType,
  type RowForm,
} from "./rowEditForm";
import type { TransactionLine } from "./transactionsScreenData";

function line(extra: Partial<TransactionLine> = {}): TransactionLine {
  return {
    id: "t1",
    date: "Oct 28",
    title: "CORNER MARKET",
    bankText: null,
    purpose: null,
    bankType: null,
    bankCategory: null,
    accountId: "acc-card",
    account: "US Card",
    type: "spending",
    typeLabel: "Spending",
    categoryId: "cat-groceries",
    category: "Groceries",
    amount: "-$64.18",
    original: null,
    needsReview: false,
    paired: false,
    pairedWith: null,
    hidden: false,
    ...extra,
  };
}

const PAIRED = line({
  type: "transfer",
  typeLabel: "Transfer",
  categoryId: null,
  category: null,
  paired: true,
  pairedWith: "US Checking, -$812.40",
});

function edited(row: TransactionLine, changes: Partial<RowForm>) {
  return editFrom(row, { ...rowForm(row), ...changes });
}

describe("rowForm", () => {
  it("starts from what the row holds", () => {
    expect(rowForm(line())).toEqual({
      label: "",
      type: "spending",
      categoryId: "cat-groceries",
      hidden: false,
    });
  });

  it("starts with the owner's label, not the bank text", () => {
    expect(
      rowForm(line({ title: "Corner shop", bankText: "CORNER MARKET" })).label,
    ).toBe("Corner shop");
  });

  it("starts blank for a row with no type", () => {
    expect(
      rowForm(
        line({ type: null, typeLabel: null, categoryId: null, category: null }),
      ),
    ).toMatchObject({ type: "", categoryId: "" });
  });

  it("starts with the row's hidden state", () => {
    expect(rowForm(line({ hidden: true })).hidden).toBe(true);
  });
});

describe("withFormType", () => {
  it("clears the category when the type changes", () => {
    expect(withFormType(rowForm(line()), "income")).toMatchObject({
      type: "income",
      categoryId: "",
    });
  });
});

describe("editFrom", () => {
  it("sends nothing when nothing changed", () => {
    expect(editFrom(line(), rowForm(line()))).toEqual({});
  });

  it("sends only the label when only the label changed", () => {
    expect(edited(line(), { label: "Corner shop" })).toEqual({
      label: "Corner shop",
    });
  });

  it("sends a blank label when it was cleared", () => {
    const labelled = line({ title: "Corner shop", bankText: "CORNER MARKET" });

    expect(edited(labelled, { label: "   " })).toEqual({ label: "   " });
  });

  it("sends no label when only its spacing changed", () => {
    const labelled = line({ title: "Corner shop", bankText: "CORNER MARKET" });

    expect(edited(labelled, { label: " Corner shop " })).toEqual({});
  });

  it("sends only the hidden state when only that changed", () => {
    expect(edited(line(), { hidden: true })).toEqual({ hidden: true });
  });

  it("sends a new category alone, so the type stays spending", () => {
    expect(edited(line(), { categoryId: "cat-dining" })).toEqual({
      categoryId: "cat-dining",
    });
  });

  it("sends a cleared category as null", () => {
    expect(edited(line(), { categoryId: "" })).toEqual({ categoryId: null });
  });

  it("sends a new type and its cleared category together", () => {
    const form = withFormType(rowForm(line()), "income");

    expect(editFrom(line(), form)).toEqual({
      type: "income",
      categoryId: null,
    });
  });

  it("sends No Type as null", () => {
    const form = withFormType(rowForm(line()), "");

    expect(editFrom(line(), form)).toEqual({ type: null, categoryId: null });
  });

  it("sends a type and category chosen on a row with neither", () => {
    const open = line({
      type: null,
      typeLabel: null,
      categoryId: null,
      category: null,
    });

    expect(edited(open, { type: "spending", categoryId: "cat-dining" })).toEqual(
      { type: "spending", categoryId: "cat-dining" },
    );
  });
});

describe("pairWarning", () => {
  it("says nothing on a paired row until its type changes", () => {
    expect(pairWarning(PAIRED, rowForm(PAIRED))).toBeNull();
  });

  it("names the other row when the type changes", () => {
    expect(
      pairWarning(PAIRED, withFormType(rowForm(PAIRED), "income")),
    ).toBe(
      "Changing the type removes this row's pair with US Checking, -$812.40. That row goes back to review.",
    );
  });

  it("warns about No Type too", () => {
    expect(
      pairWarning(PAIRED, withFormType(rowForm(PAIRED), "")),
    ).not.toBeNull();
  });

  it("still warns when the other row is in another month", () => {
    const acrossMonths = { ...PAIRED, pairedWith: null };

    expect(
      pairWarning(acrossMonths, withFormType(rowForm(acrossMonths), "income")),
    ).toBe(
      "Changing the type removes this row's pair. The other row goes back to review.",
    );
  });

  it("says nothing on a row with no pair", () => {
    expect(pairWarning(line(), withFormType(rowForm(line()), "income"))).toBeNull();
  });
});
