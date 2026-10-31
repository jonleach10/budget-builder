import { describe, expect, it } from "vitest";
import { isIbanShaped, REDACTED, redactIdentifier, redactText } from "./redact";

describe("redactText", () => {
  it.each([
    ["a bare IBAN", "Rent DE00123456789012345678 for May", `Rent ${REDACTED} for May`],
    ["a spaced IBAN", "Rent DE00 1234 5678 9012 3456 78 for May", `Rent ${REDACTED} for May`],
    ["an IBAN with letters", "To GB00ABCD12345678901234.", `To ${REDACTED}.`],
    ["an IBAN glued to a label", "IBAN:DE00123456789012345678", `IBAN:${REDACTED}`],
    ["an IBAN glued to a word", "PAIDDE00123456789012345678", `PAID${REDACTED}`],
    ["an IBAN broken by repeated spaces", "DE00  1234   5678 9012 3456 78", REDACTED],
  ])("replaces %s", (_label, text, expected) => {
    expect(redactText(text)).toBe(expected);
  });

  it("removes a spaced IBAN that follows long words and a reference", () => {
    expect(
      redactText("KD12 MIETE OKTOBER 2026 DE00 1234 5678 9012 3456 78"),
    ).not.toMatch(/1234|5678|9012|3456|\b78\b/);
  });

  it("removes a spaced IBAN that follows only short words", () => {
    expect(
      redactText("KD12 RENT FOR MAY 2026 DE00 1234 5678 9012 3456 78"),
    ).not.toMatch(/1234|5678|9012|3456|\b78\b/);
  });

  it("removes an IBAN wrapped at arbitrary points", () => {
    expect(redactText("DE0012345 67890123456 78")).toBe(REDACTED);
  });

  it("keeps the words after an IBAN", () => {
    expect(redactText("DE00123456789012345678 EXAMPLE SHOP")).toBe(
      `${REDACTED} EXAMPLE SHOP`,
    );
  });

  it.each([
    ["a digit run", "Card 1111222233334444 used", `Card ${REDACTED} used`],
    ["a 12-digit run", "Ref 123456789012", `Ref ${REDACTED}`],
    ["a run glued to letters", "Order1111222233334444", `Order${REDACTED}`],
    ["spaced groups", "Card 1111 2222 3333 4444", `Card ${REDACTED}`],
    ["hyphen groups", "Card 1111-2222-3333-4444", `Card ${REDACTED}`],
    ["a form masked with X", "Card 5232 XXXX XXXX 1234", `Card ${REDACTED}`],
    ["a form masked with stars", "Card 5232********1234", `Card ${REDACTED}`],
    ["a form masked from the start", "Card XXXX XXXX XXXX 1234", `Card ${REDACTED}`],
  ])("replaces %s", (_label, text, expected) => {
    expect(redactText(text)).toBe(expected);
  });

  it.each([
    ["an 11-digit number", "Ref 12345678901"],
    ["a truncated account reference", "CHK ...1111"],
    ["a merchant with a star", "SHOP *EXAMPLE.COM CA"],
    ["a phone number", "800-555-1234"],
    ["a word starting like an IBAN", "AB12 CAFE CENTRAL BERLIN"],
    ["a store number", "EXAMPLE MARKET #1234 SPRINGFIELD"],
    ["a dimension in lower case x", "100 x 200 x 300 x 400 x 500"],
    ["masks with no digits", "XXXXXXXXXXXXXXXX"],
  ])("leaves %s alone", (_label, text) => {
    expect(redactText(text)).toBe(text);
  });

  it("collapses repeated whitespace and trims", () => {
    expect(redactText("  SHOP   *EXAMPLE.COM \t CA  ")).toBe(
      "SHOP *EXAMPLE.COM CA",
    );
  });

  it("handles a long digit run without slowing down", () => {
    expect(redactText(`${"1".repeat(5000)}x`)).not.toContain("1");
  });

  it.each([
    ["short capitalized words", `AB12${" A".repeat(50000)} 1`],
    ["long capitalized words", `AB12${" ABCDE".repeat(50000)} 1`],
    ["references that start like an IBAN", `${"AB12 ".repeat(50000)}1`],
  ])("handles a long run of %s without slowing down", (_label, text) => {
    const startedAt = performance.now();
    redactText(text);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it("leaves merchant text with a postcode alone", () => {
    const text = "AB12 CAFE CENTRAL BERLIN 10115";
    expect(redactText(text)).toBe(text);
  });

  it("redacts short words it can't tell from an IBAN", () => {
    expect(redactText("AB12 CAFE BAR 10115")).toBe(REDACTED);
  });

  it("keeps a long word in front of a spaced IBAN", () => {
    expect(
      redactText("KD12 MIETE OKTOBER 2026 DE00 1234 5678 9012 3456 78"),
    ).toBe(`KD12 MIETE OKTOBER 2026 ${REDACTED}`);
  });
});

describe("redactIdentifier", () => {
  it("keeps a plain reference", () => {
    expect(redactIdentifier("12345678901")).toBe("12345678901");
  });

  it("keeps a SEPA creditor ID, which isn't an account number", () => {
    expect(redactIdentifier("DE00ZZZ00001234567")).toBe("DE00ZZZ00001234567");
  });

  it("keeps a creditor ID with another business code", () => {
    expect(redactIdentifier("DE00ABC00001234567")).toBe("DE00ABC00001234567");
  });

  it("drops an IBAN with a four-letter bank code", () => {
    expect(redactIdentifier("GB00WEST12345698765432")).toBeUndefined();
  });

  it("drops an IBAN rather than keeping a placeholder", () => {
    expect(redactIdentifier("DE00123456789012345678")).toBeUndefined();
  });

  it("drops a card-shaped number rather than keeping a placeholder", () => {
    expect(redactIdentifier("1111222233334444")).toBeUndefined();
  });
});

describe("isIbanShaped", () => {
  it("accepts bare and spaced IBANs", () => {
    expect(isIbanShaped("DE00123456789012345678")).toBe(true);
    expect(isIbanShaped("DE00 1234 5678 9012 3456 78")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isIbanShaped("")).toBe(false);
    expect(isIbanShaped("EUR")).toBe(false);
    expect(isIbanShaped("DE00123")).toBe(false);
  });
});
