import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CategoryRow } from "./categories";
import { SettingsScreen } from "./SettingsScreen";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
];

function render(categories: readonly CategoryRow[] | null): string {
  return renderToStaticMarkup(createElement(SettingsScreen, { categories }));
}

describe("SettingsScreen", () => {
  it("lists categories in the order it's given", () => {
    const html = render(CATEGORIES);

    expect(html.indexOf("Groceries")).toBeLessThan(html.indexOf("Dining"));
  });

  it("names each category action for screen readers", () => {
    const html = render(CATEGORIES);

    for (const label of [
      "Move Dining up",
      "Move Dining down",
      "Rename Dining",
      "Delete Dining",
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it("makes the first category's up button and the last one's down button unavailable", () => {
    const html = render(CATEGORIES);

    expect(html).toMatch(/aria-label="Move Groceries up" disabled=""/);
    expect(html).toMatch(/aria-label="Move Dining down" disabled=""/);
    expect(html).not.toMatch(/aria-label="Move Dining up" disabled=""/);
  });

  it("shows the base currency without a control to change it", () => {
    const html = render(CATEGORIES);
    const card = html.slice(html.indexOf("Base Currency"));

    expect(card).toContain(">USD</span>");
    expect(card).not.toMatch(/<(input|select|button)/);
  });

  it("still shows the base currency when categories can't be read", () => {
    const html = render(null);

    expect(html).toContain("The categories can&#x27;t be loaded.");
    expect(html).toContain("Base Currency");
    expect(html).not.toContain("No categories yet.");
  });
});
