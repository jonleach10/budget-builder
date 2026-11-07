import { describe, expect, it } from "vitest";
import { redactText } from "@/features/import/redact";
import type { Transaction } from "@/features/import/types";
import { firstMatchingRule, type RuleCondition } from "./matchRule";

function transaction(description: string): Transaction {
  return {
    accountId: "acct-1",
    fingerprint: "fingerprint-1",
    postedOn: "2026-10-05",
    amount: { minor: -1199, currency: "USD" },
    description,
  };
}

const redacted = transaction(redactText("PAY DE00123456789012345678 RENT"));

describe("firstMatchingRule on redacted text", () => {
  it.each<RuleCondition>([
    { matchOn: "descriptionContains", value: "RED" },
    { matchOn: "descriptionContains", value: "[REDACTED]" },
  ])("doesn't match the placeholder: $matchOn $value", (rule) => {
    expect(firstMatchingRule(redacted, [rule])).toBeUndefined();
  });

  it("doesn't match a leading placeholder with a starts-with rule", () => {
    const rule: RuleCondition = { matchOn: "descriptionStartsWith", value: "[RED" };

    expect(firstMatchingRule(transaction("[REDACTED] RENT"), [rule])).toBeUndefined();
  });

  it.each<RuleCondition>([
    { matchOn: "descriptionContains", value: "pay rent" },
    { matchOn: "descriptionStartsWith", value: "PAY" },
  ])("matches the text around it: $matchOn $value", (rule) => {
    expect(firstMatchingRule(redacted, [rule])).toBe(rule);
  });

  // A value copied from the screen holds the placeholder, as the row does.
  it.each<RuleCondition>([
    { matchOn: "descriptionStartsWith", value: "Pay [REDACTED] Rent" },
    { matchOn: "descriptionContains", value: "PAY [REDACTED] RENT" },
    { matchOn: "descriptionContains", value: "[REDACTED] RENT" },
  ])("matches a value copied from the row: $matchOn $value", (rule) => {
    expect(firstMatchingRule(redacted, [rule])).toBe(rule);
  });

  it.each<RuleCondition>([
    { matchOn: "descriptionContains", value: "[REDACTED]" },
    { matchOn: "descriptionStartsWith", value: " [REDACTED] [REDACTED] " },
  ])("never matches a value that is only placeholders: $matchOn $value", (rule) => {
    expect(firstMatchingRule(redacted, [rule])).toBeUndefined();
    expect(firstMatchingRule(transaction("EXAMPLE SHOP"), [rule])).toBeUndefined();
  });

  it("matches the start of the text after a leading placeholder", () => {
    const rule: RuleCondition = { matchOn: "descriptionStartsWith", value: "RENT" };

    expect(
      firstMatchingRule(transaction("[REDACTED] RENT"), [rule]),
    ).toBe(rule);
  });
});
