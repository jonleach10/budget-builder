import { describe, expect, it } from "vitest";
import { rowTitle } from "./rowTitle";

describe("rowTitle", () => {
  it("shows the bank text alone when the row has no label", () => {
    expect(rowTitle({ note: null, description: "SAMPLE GROCER" })).toEqual({
      title: "SAMPLE GROCER",
      bankText: null,
    });
  });

  it("shows the label first, with the bank text under it", () => {
    expect(
      rowTitle({ note: "Corner shop", description: "SAMPLE GROCER" }),
    ).toEqual({ title: "Corner shop", bankText: "SAMPLE GROCER" });
  });

  it("trims the label", () => {
    expect(
      rowTitle({ note: "  Corner shop ", description: "SAMPLE GROCER" }),
    ).toEqual({ title: "Corner shop", bankText: "SAMPLE GROCER" });
  });

  it.each(["", "   ", "\t\n"])("treats a blank label (%j) as no label", (note) => {
    expect(rowTitle({ note, description: "SAMPLE GROCER" })).toEqual({
      title: "SAMPLE GROCER",
      bankText: null,
    });
  });
});
