import { describe, expect, it } from "vitest";
import { totpCode } from "./totp.ts";

/** RFC 6238 appendix B's SHA-1 seed, "12345678901234567890", in base32. */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totpCode", () => {
  // The RFC prints 8 digits, and a 6-digit code is the last 6 of those.
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("matches RFC 6238 at %i seconds", (seconds, code) => {
    expect(totpCode(RFC_SECRET, seconds)).toBe(code);
  });

  it("gives one code across a 30-second step", () => {
    expect(totpCode(RFC_SECRET, 60)).toBe(totpCode(RFC_SECRET, 89));
    expect(totpCode(RFC_SECRET, 89)).not.toBe(totpCode(RFC_SECRET, 90));
  });

  it("reads a secret written in lower case or with padding", () => {
    expect(totpCode(`${RFC_SECRET.toLowerCase()}====`, 59)).toBe("287082");
  });
});
