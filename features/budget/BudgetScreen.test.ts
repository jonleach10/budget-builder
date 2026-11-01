import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetScreen } from "./BudgetScreen";
import type {
  BudgetLine,
  BudgetScreenData,
  ReadyBudgetScreen,
} from "./budgetScreenData";
import type { BudgetView } from "./screenParams";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const action = vi.hoisted(() => ({ pending: false }));

vi.mock("@/hooks/use-server-action", () => ({
  useServerAction: () => ({ pending: action.pending, run: vi.fn() }),
}));

afterEach(() => {
  action.pending = false;
});

const GROCERIES: BudgetLine = {
  categoryId: "cat-groceries",
  name: "Groceries",
  amountInput: "450.00",
  budgeted: "$450.00",
  spent: "$500.00",
  remaining: "-$50.00",
  over: true,
  used: { percent: 100, label: "111% used" },
  transactions: [],
};

const DINING: BudgetLine = {
  categoryId: "cat-dining",
  name: "Dining",
  amountInput: "",
  budgeted: "$0.00",
  spent: "$0.00",
  remaining: "$0.00",
  over: false,
  used: { percent: 0, label: "0% used" },
  transactions: [],
};

function ready(extra: Partial<ReadyBudgetScreen> = {}): ReadyBudgetScreen {
  return {
    status: "ready",
    subtitle: "Amounts are in USD. Changes apply to October 2026 only.",
    review: "2 rows need review and aren't in the budget totals.",
    country: "US",
    currency: "USD",
    setup: { kind: "has-amounts" },
    lines: [GROCERIES, DINING],
    totals: {
      budgeted: "$450.00",
      spent: "$500.00",
      remaining: "-$50.00",
      over: true,
    },
    noTransactions: "No transactions in this category for October 2026.",
    ...extra,
  };
}

function render(screen: BudgetScreenData | null, view: BudgetView = "us") {
  return renderToStaticMarkup(
    createElement(BudgetScreen, {
      params: { month: "2026-10", view },
      screen,
    }),
  );
}

describe("BudgetScreen", () => {
  it("uses real tables with a caption, for screen readers", () => {
    const html = render(ready());

    expect(html).toContain("<table");
    expect(html).toContain(
      "<caption class=\"sr-only\">Budgeted, spent and remaining by category</caption>",
    );
  });

  it("gives each category a button that reports whether it's open, in both layouts", () => {
    const html = render(ready());
    const buttons = html.match(
      /aria-expanded="false" aria-label="Groceries transactions"/g,
    );

    expect(buttons).toHaveLength(2);
  });

  it("makes the category button at least 44px tall on a phone", () => {
    expect(render(ready())).toMatch(/aria-expanded="false"[^>]*min-h-11/);
  });

  it("has an amount field per category, labeled, with the saved amount", () => {
    const html = render(ready());

    expect(html).toContain('aria-label="Budget for Groceries"');
    expect(html).toContain('value="450.00"');
  });

  it("leaves a category with nothing saved blank", () => {
    expect(render(ready())).toMatch(
      /aria-label="Budget for Dining"[^>]*value=""/,
    );
  });

  it("has one Save Budget button per layout, with the desktop one tied to the form", () => {
    const html = render(ready());

    expect(html.match(/Save Budget/g)).toHaveLength(2);
    expect(html).toContain('form="budget-form"');
  });

  it("makes Combined read-only", () => {
    const html = render(ready({ country: null }), "combined");

    expect(html).not.toContain("<input");
    expect(html).not.toContain("Save Budget");
    expect(html).toContain("$450.00");
  });

  it("marks a negative remaining with an icon and the sign, not color alone", () => {
    const html = render(ready());

    expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain("-$50.00");
  });

  it("shows the needs-review count as text, not a link", () => {
    const html = render(ready());

    expect(html).toContain(
      "2 rows need review and aren&#x27;t in the budget totals.",
    );
    expect(html).not.toMatch(/<a[^>]*>[^<]*rows need review/);
  });

  it("shows only the running action as busy", () => {
    action.pending = true;

    const html = render(
      ready({
        setup: {
          kind: "copy",
          from: "2026-09",
          fromLabel: "September 2026",
          title: "No Budget for October 2026",
          text: "Copy the amounts from September 2026, then edit any that change.",
        },
      }),
    );

    expect(html).toContain("Saving...");
    expect(html).not.toContain("Copying...");
    expect(html).toContain("Copy September 2026");
  });

  it("offers the copy, with the button naming the month", () => {
    const html = render(
      ready({
        setup: {
          kind: "copy",
          from: "2026-09",
          fromLabel: "September 2026",
          title: "No Budget for October 2026",
          text: "Copy the amounts from September 2026, then edit any that change.",
        },
      }),
    );

    expect(html).toContain("No Budget for October 2026");
    expect(html).toContain("Copy September 2026");
  });

  it("keeps violet for the copy button when a copy is on offer", () => {
    const html = render(
      ready({
        setup: {
          kind: "copy",
          from: "2026-09",
          fromLabel: "September 2026",
          title: "No Budget for October 2026",
          text: "Copy the amounts from September 2026, then edit any that change.",
        },
      }),
    );

    expect(html.match(/(?<![:\w-])bg-primary(?![/\w-])/g)).toHaveLength(1);
  });

  it("explains the first budget", () => {
    const html = render(
      ready({
        setup: {
          kind: "first",
          title: "Set the October 2026 Budget",
          text: "Amounts are in USD. Leave a category blank to budget nothing for it.",
        },
      }),
    );

    expect(html).toContain("Set the October 2026 Budget");
    expect(html).toContain("Leave a category blank");
  });

  it("says Combined has no rate, with no table", () => {
    const html = render(
      {
        status: "no-rate",
        subtitle: "Amounts are in USD.",
        message: "Combined figures need a saved EUR rate for October 2026.",
      },
      "combined",
    );

    expect(html).toContain("Combined figures need a saved EUR rate");
    expect(html).toContain(
      "The US and Germany views still show their own amounts.",
    );
    expect(html).not.toContain("<table");
  });

  it("says so when the month can't be loaded", () => {
    expect(render(null)).toContain("This month can&#x27;t be loaded.");
  });

  it("keeps the month and view in its links", () => {
    const html = render(ready());

    expect(html).toContain('href="/budget?month=2026-09&amp;view=us"');
    expect(html).toContain('href="/budget?month=2026-11&amp;view=us"');
    expect(html).toContain('href="/budget?month=2026-10&amp;view=combined"');
    expect(html).toMatch(/aria-current="page"[^>]*>US</);
  });

  it("uses no backdrop blur on its tables", () => {
    expect(render(ready())).not.toContain("backdrop-blur");
  });
});
