import { describe, expect, it } from "vitest";
import { addFiles, formatSize, sizeText, uploadRefusal } from "./uploadLimit";

describe("formatSize", () => {
  it.each([
    [0, "0 KB"],
    [300, "1 KB"],
    [228_000, "228 KB"],
    [228_001, "229 KB"],
    [999_000, "999 KB"],
  ])("rounds %d bytes up to whole KB", (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });

  it.each([
    [999_400, "1 MB"],
    [1_000_000, "1 MB"],
    [1_400_000, "1.4 MB"],
    [1_000_400, "1.1 MB"],
  ])("shows %d bytes in MB, rounded up", (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
});

describe("sizeText", () => {
  it("adds up the files against the limit", () => {
    expect(sizeText([96_000, 132_000])).toBe("228 KB of 1 MB");
  });

  it("starts at zero", () => {
    expect(sizeText([])).toBe("0 KB of 1 MB");
  });
});

describe("addFiles", () => {
  const first = { name: "one.csv", size: 100 };
  const second = { name: "two.csv", size: 200 };

  it("adds new files after the ones already chosen", () => {
    expect(addFiles([first], [second])).toEqual([first, second]);
  });

  it("keeps one copy of a file chosen twice", () => {
    expect(addFiles([first], [{ ...first }])).toEqual([first]);
  });

  it("keeps one copy of a file listed twice in one choice", () => {
    expect(addFiles([], [first, { ...first }])).toEqual([first]);
  });

  it("keeps two files that share a name but differ in size", () => {
    const other = { name: "one.csv", size: 999 };

    expect(addFiles([first], [other])).toEqual([first, other]);
  });
});

describe("uploadRefusal", () => {
  it("allows files that total exactly the limit", () => {
    expect(uploadRefusal([600_000, 400_000])).toBeNull();
  });

  it("refuses one byte over, without calling it the same size as the limit", () => {
    expect(uploadRefusal([600_000, 400_001])).toBe(
      "These files total 1.1 MB, and the limit is 1 MB. Nothing was sent. Import fewer files at once.",
    );
  });

  it("gives the approved text for a set of 1.4 MB", () => {
    expect(uploadRefusal([1_000_000, 400_000])).toBe(
      "These files total 1.4 MB, and the limit is 1 MB. Nothing was sent. Import fewer files at once.",
    );
  });
});
