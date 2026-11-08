import { describe, expect, it } from "vitest";
import type { TransactionLine } from "@/features/transactions/transactionsScreenData";
import {
  acceptLabel,
  decisionEdit,
  noMerchantEdit,
  noMerchantForm,
  rowSavedNotice,
  showsUse,
  START_DECISION,
  withDecisionType,
} from "./reviewForm";

const SUGGESTION = { categoryId: "cat-groceries", name: "Groceries" };

function line(extra: Partial<TransactionLine> = {}): TransactionLine {
  return {
    id: "t1",
    date: "Oct 3",
    title: "[REDACTED]",
    bankText: null,
    purpose: null,
    bankType: null,
    bankCategory: null,
    accountId: "acc-us",
    account: "Joint Checking",
    type: null,
    typeLabel: null,
    categoryId: null,
    category: null,
    amount: "-$40.00",
    original: null,
    needsReview: true,
    paired: false,
    pairedWith: null,
    hidden: false,
    ...extra,
  };
}

describe("a group's decision", () => {
  it("starts as spending with no category, so nothing is chosen for the owner", () => {
    expect(START_DECISION).toEqual({ type: "spending", categoryId: "" });
    expect(decisionEdit(START_DECISION)).toBeNull();
  });

  it("gives a category, which makes the rows spending", () => {
    expect(
      decisionEdit({ type: "spending", categoryId: "cat-groceries" }),
    ).toEqual({ categoryId: "cat-groceries" });
  });

  it.each([["income"], ["transfer"], ["saved"], ["personal"]] as const)(
    "gives the type %s with no category",
    (type) => {
      expect(decisionEdit(withDecisionType(START_DECISION, type))).toEqual({
        type,
      });
    },
  );

  it("clears the category when the type changes", () => {
    expect(
      withDecisionType({ type: "spending", categoryId: "cat-groceries" }, "income"),
    ).toEqual({ type: "income", categoryId: "" });
  });

  it("names how many rows Accept saves", () => {
    expect(acceptLabel(6)).toBe("Accept 6 Rows");
    expect(acceptLabel(1)).toBe("Accept 1 Row");
    expect(acceptLabel(1200)).toBe("Accept 1,200 Rows");
  });
});

describe("the notice after Save Row", () => {
  it("is about that row, by its date, with no earlier count", () => {
    expect(rowSavedNotice(line({ date: "Oct 3" }))).toEqual({
      tone: "done",
      text: "The row from Oct 3 was saved.",
    });
  });
});

describe("Use", () => {
  it("shows while the suggestion isn't chosen", () => {
    expect(showsUse(START_DECISION, SUGGESTION)).toBe(true);
  });

  it("hides once the suggestion is the category", () => {
    expect(
      showsUse({ type: "spending", categoryId: "cat-groceries" }, SUGGESTION),
    ).toBe(false);
  });

  it("hides when the type isn't spending", () => {
    expect(showsUse(withDecisionType(START_DECISION, "income"), SUGGESTION)).toBe(
      false,
    );
  });

  it("hides with no suggestion", () => {
    expect(showsUse(START_DECISION, null)).toBe(false);
  });
});

describe("a No Merchant row", () => {
  it("starts with the row's label, spending and no category", () => {
    expect(
      noMerchantForm(line({ title: "Landlord", bankText: "[REDACTED]" })),
    ).toEqual({ label: "Landlord", type: "spending", categoryId: "" });
    expect(noMerchantForm(line())).toEqual({
      label: "",
      type: "spending",
      categoryId: "",
    });
  });

  it("starts with the row's own type when it has one", () => {
    expect(noMerchantForm(line({ type: "spending" })).type).toBe("spending");
  });

  it("saves nothing until something changes", () => {
    expect(noMerchantEdit(line(), noMerchantForm(line()))).toBeNull();
  });

  it("saves a label alone, leaving the row in review", () => {
    const form = { ...noMerchantForm(line()), label: "Landlord" };

    expect(noMerchantEdit(line(), form)).toEqual({ label: "Landlord" });
  });

  it("saves a decision with the label", () => {
    const form = {
      label: "Landlord",
      type: "spending" as const,
      categoryId: "cat-housing",
    };

    expect(noMerchantEdit(line(), form)).toEqual({
      categoryId: "cat-housing",
      label: "Landlord",
    });
  });

  it("clears a label the owner emptied", () => {
    const labeled = line({ title: "Landlord", bankText: "[REDACTED]" });
    const form = { ...noMerchantForm(labeled), label: "  " };

    expect(noMerchantEdit(labeled, form)).toEqual({ label: "  " });
  });

  it("leaves out a label that only gained spaces", () => {
    const labeled = line({ title: "Landlord", bankText: "[REDACTED]" });
    const form = {
      ...noMerchantForm(labeled),
      label: " Landlord ",
      categoryId: "cat-housing",
    };

    expect(noMerchantEdit(labeled, form)).toEqual({ categoryId: "cat-housing" });
  });
});
