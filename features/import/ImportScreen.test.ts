import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ImportFinished, ImportScreen } from "./ImportScreen";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const SUMMARY = {
  newRows: 1312,
  skippedRows: 48,
  possibleDuplicates: 3,
  ignoredPending: 2,
};

function finished(fileCount: number): string {
  return renderToStaticMarkup(
    createElement(ImportFinished, {
      summary: SUMMARY,
      fileCount,
      onImportMore: () => {},
    }),
  );
}

describe("ImportScreen", () => {
  const html = renderToStaticMarkup(createElement(ImportScreen));

  it("starts with a drop area and nothing to import", () => {
    expect(html).toContain("Drop CSV Files Here");
    expect(html).toContain(
      "Add files for several accounts at once. All of them are imported, or none are.",
    );
    expect(html).toContain("Choose Files");
    expect(html).toContain("0 KB of 1 MB");
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>Import<\/button>/);
  });

  it("takes several CSV files", () => {
    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple/);
    expect(html).toContain('accept=".csv,text/csv"');
  });

  it("says the files aren't kept", () => {
    expect(html).toContain("the files aren&#x27;t kept");
  });

  it("hides the import form on a phone and says Import works on a laptop", () => {
    expect(html).toContain("Import Works on a Laptop");
    expect(html).toMatch(/class="[^"]*\bhidden md:block[^"]*"/);
    expect(html).toMatch(/class="[^"]*md:hidden[^"]*"/);
    expect(html).toContain('href="/review"');
  });
});

describe("ImportFinished", () => {
  it("shows the four counts", () => {
    const html = finished(3);

    for (const label of ["New", "Skipped", "Possible Duplicates", "Ignored Pending"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("1,312");
    expect(html).toContain(">48<");
    expect(html).toContain(">3<");
    expect(html).toContain(">2<");
  });

  it("names the files imported", () => {
    expect(finished(3)).toContain("Imported 3 files. Nothing was overwritten.");
    expect(finished(1)).toContain("Imported 1 file. Nothing was overwritten.");
  });

  it("offers the next steps", () => {
    const html = finished(3);

    expect(html).toContain("Import More Files");
    expect(html).toContain("Go to Review Inbox");
    expect(html).toContain('href="/review"');
  });
});
