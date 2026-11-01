import { describe, expect, it } from "vitest";
import { copyButtonText, reviewText, saveButtonText } from "./screenText";

describe("reviewText", () => {
  it("says when nothing needs review", () => {
    expect(reviewText(0)).toBe("No rows need review.");
  });

  it("names the budget totals, because Net Saved can include these rows", () => {
    expect(reviewText(1)).toBe(
      "1 row needs review and isn't in the budget totals.",
    );
    expect(reviewText(1200)).toBe(
      "1,200 rows need review and aren't in the budget totals.",
    );
  });
});

describe("saveButtonText", () => {
  it("is busy only while a save runs", () => {
    expect(saveButtonText("save")).toBe("Saving...");
    expect(saveButtonText("copy")).toBe("Save Budget");
    expect(saveButtonText(null)).toBe("Save Budget");
  });
});

describe("copyButtonText", () => {
  it("is busy only while a copy runs", () => {
    expect(copyButtonText("copy", "September 2026")).toBe("Copying...");
    expect(copyButtonText("save", "September 2026")).toBe(
      "Copy September 2026",
    );
    expect(copyButtonText(null, "September 2026")).toBe("Copy September 2026");
  });
});
