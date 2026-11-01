import { describe, expect, it } from "vitest";
import { changedRows } from "./actionResult";

describe("changedRows", () => {
  it("is done when the write returned a row", () => {
    expect(changedRows([{ id: "a" }], null)).toBe("done");
  });

  it("is missing when no row matched, which Supabase doesn't call an error", () => {
    expect(changedRows([], null)).toBe("missing");
  });

  it("is failed when the write returned an error", () => {
    expect(changedRows(null, { code: "22P02" })).toBe("failed");
  });
});
