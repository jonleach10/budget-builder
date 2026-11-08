import { describe, expect, it } from "vitest";
import { NO_FILTERS } from "./filterTransactions";
import {
  paramsOf,
  readTransactionFilters,
  transactionsHref,
} from "./transactionsParams";

const KNOWN = {
  accounts: [{ id: "acc-card" }, { id: "acc-giro" }],
  categories: [{ id: "cat-groceries" }, { id: "cat-dining" }],
};

const NONE = { accountId: "", type: "", categoryId: "" };

describe("readTransactionFilters", () => {
  it("reads the account, type and category from the URL", () => {
    expect(
      readTransactionFilters(
        { account: "acc-card", type: "spending", category: "cat-dining" },
        KNOWN,
      ),
    ).toEqual({ accountId: "acc-card", type: "spending", categoryId: "cat-dining" });
  });

  it("filters nothing when the URL names nothing", () => {
    expect(readTransactionFilters({}, KNOWN)).toEqual(NONE);
  });

  it("shows every account for an account that isn't one", () => {
    expect(readTransactionFilters({ account: "acc-gone" }, KNOWN)).toEqual(NONE);
  });

  it("shows every account for an empty account", () => {
    expect(readTransactionFilters({ account: "" }, KNOWN).accountId).toBe("");
  });

  it("keeps the account when the type and category are bad", () => {
    expect(
      readTransactionFilters(
        { account: "acc-giro", type: "gifts", category: "cat-dining" },
        KNOWN,
      ),
    ).toEqual({ accountId: "acc-giro", type: "", categoryId: "" });
  });

  it.each(["income", "transfer", "saved", "personal"])(
    "reads the type %j",
    (type) => {
      expect(readTransactionFilters({ type }, KNOWN).type).toBe(type);
    },
  );

  it("ignores a type that isn't one", () => {
    expect(readTransactionFilters({ type: "Spending" }, KNOWN).type).toBe("");
  });

  it("ignores a category that isn't one, keeping Spending", () => {
    expect(
      readTransactionFilters({ type: "spending", category: "cat-gone" }, KNOWN),
    ).toEqual({ accountId: "", type: "spending", categoryId: "" });
  });

  it("ignores a category with a type other than Spending, as the screen does", () => {
    expect(
      readTransactionFilters({ type: "income", category: "cat-dining" }, KNOWN),
    ).toEqual({ accountId: "", type: "income", categoryId: "" });
  });

  it("ignores a category with no type", () => {
    expect(readTransactionFilters({ category: "cat-dining" }, KNOWN)).toEqual(
      NONE,
    );
  });

  it("ignores a value that's repeated in the URL", () => {
    expect(
      readTransactionFilters(
        {
          account: ["acc-card", "acc-giro"],
          type: ["spending", "income"],
          category: ["cat-dining", "cat-groceries"],
        },
        KNOWN,
      ),
    ).toEqual(NONE);
  });
});

describe("transactionsHref", () => {
  it("names only the month when nothing is filtered", () => {
    expect(transactionsHref("2026-10")).toBe("/transactions?month=2026-10");
    expect(transactionsHref("2026-10", NO_FILTERS)).toBe(
      "/transactions?month=2026-10",
    );
  });

  it("puts the month, account, type and category in the URL", () => {
    expect(
      transactionsHref("2026-10", {
        accountId: "acc-card",
        type: "spending",
        categoryId: "cat-dining",
      }),
    ).toBe(
      "/transactions?month=2026-10&account=acc-card&type=spending&category=cat-dining",
    );
  });

  it("leaves out what only stays on the screen: search, Needs Review and Show Hidden", () => {
    expect(
      transactionsHref("2026-10", {
        ...NO_FILTERS,
        accountId: "acc-giro",
        search: "cafe",
        needsReview: true,
        showHidden: true,
      }),
    ).toBe("/transactions?month=2026-10&account=acc-giro");
  });

  it("leaves out a category unless the type is Spending", () => {
    expect(
      transactionsHref("2026-10", { type: "income", categoryId: "cat-dining" }),
    ).toBe("/transactions?month=2026-10&type=income");
  });

  it("gives URLs that readTransactionFilters reads back", () => {
    const filters = {
      accountId: "acc-giro",
      type: "spending",
      categoryId: "cat-groceries",
    } as const;
    const query = new URL(
      transactionsHref("2026-10", filters),
      "https://example.test",
    ).searchParams;

    expect(readTransactionFilters(paramsOf(query), KNOWN)).toEqual(filters);
  });
});

describe("paramsOf", () => {
  it("reads each value, keeping a repeated one as a list", () => {
    expect(
      paramsOf(new URLSearchParams("month=2026-10&account=a&account=b")),
    ).toEqual({ month: "2026-10", account: ["a", "b"] });
  });

  it("reads no URL as no values", () => {
    expect(paramsOf(null)).toEqual({});
  });
});
