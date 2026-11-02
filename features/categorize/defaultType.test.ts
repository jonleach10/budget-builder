import { describe, expect, it } from "vitest";
import type { Transaction } from "@/features/import/types";
import { defaultType } from "./defaultType";

function transaction(bankType?: string): Transaction {
  return {
    accountId: "acct-1",
    fingerprint: "fingerprint-1",
    postedOn: "2026-10-05",
    amount: { minor: -1199, currency: "USD" },
    description: "EXAMPLE MARKET 42",
    bankType,
  };
}

describe("defaultType", () => {
  it.each(["Sale", "Return", "Fee", "DEBIT_CARD", "FEE_TRANSACTION", "Debit"])(
    "gives spending for the bank type %s",
    (bankType) => {
      expect(defaultType(transaction(bankType))).toBe("spending");
    },
  );

  it.each(["Payment", "ACCT_XFER", "ACH_DEBIT", "ACH_CREDIT", "Adjustment"])(
    "gives undefined for the bank type %s",
    (bankType) => {
      expect(defaultType(transaction(bankType))).toBeUndefined();
    },
  );

  it("gives undefined for a row with no bank type", () => {
    expect(defaultType(transaction())).toBeUndefined();
  });

  it.each(["sale", "SALE", " Sale", "Sale ", "debit_card"])(
    "matches exactly, so %j is unknown",
    (bankType) => {
      expect(defaultType(transaction(bankType))).toBeUndefined();
    },
  );

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "treats bank text like %s as unknown",
    (bankType) => {
      expect(defaultType(transaction(bankType))).toBeUndefined();
    },
  );
});
