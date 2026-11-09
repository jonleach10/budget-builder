import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_FILTERS, type TransactionFilters } from "./filterTransactions";
import {
  EditButton,
  MonthRows,
  TransactionFiltersBar,
  TransactionsScreen,
} from "./TransactionsScreen";
import type {
  TransactionLine,
  TransactionsScreenData,
} from "./transactionsScreenData";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

/** The page's URL, as the screen reads it. */
const url = vi.hoisted(() => ({ search: new URLSearchParams() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => url.search }));

beforeEach(() => {
  url.search = new URLSearchParams();
});

function line(extra: Partial<TransactionLine> = {}): TransactionLine {
  return {
    id: "t1",
    date: "Oct 28",
    title: "CORNER MARKET",
    bankText: null,
    purpose: null,
    bankType: null,
    bankCategory: null,
    accountId: "acc-card",
    account: "US Card",
    type: "spending",
    typeLabel: "Spending",
    categoryId: "cat-groceries",
    category: "Groceries",
    amount: "-$64.18",
    original: null,
    needsReview: false,
    paired: false,
    pairedWith: null,
    hidden: false,
    ...extra,
  };
}

function data(lines: TransactionLine[]): TransactionsScreenData {
  return {
    lines,
    accounts: [
      { id: "acc-giro", name: "DE Giro" },
      { id: "acc-card", name: "US Card" },
    ],
    categories: [
      { id: "cat-groceries", name: "Groceries" },
      { id: "cat-dining", name: "Dining" },
    ],
  };
}

function render(screen: TransactionsScreenData | null, month = "2026-10") {
  return renderToStaticMarkup(
    createElement(TransactionsScreen, { month, screen }),
  );
}

function renderFilters(filters: TransactionFilters) {
  return renderToStaticMarkup(
    createElement(TransactionFiltersBar, {
      filters,
      accounts: data([]).accounts,
      categories: data([]).categories,
      onChange: () => {},
    }),
  );
}

type ControlElement = ReactElement<{
  "aria-label"?: string;
  children?: ReactNode;
  onChange: (event: { target: { value: string } }) => void;
  onClick: () => void;
}>;

/** Finds a button by its text, the same way. */
function buttonsNamed(node: ReactNode, name: string): ControlElement[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as ControlElement;
    return element.props.children === name
      ? [element]
      : buttonsNamed(element.props.children, name);
  });
}

/** Finds a control by name, so a test can use it with no browser. */
function controlsNamed(node: ReactNode, name: string): ControlElement[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as ControlElement;
    return element.props["aria-label"] === name
      ? [element]
      : controlsNamed(element.props.children, name);
  });
}

describe("TransactionsScreen", () => {
  it("shows the page title and how many rows show", () => {
    const html = render(data([line(), line({ id: "t2" })]));

    expect(html).toContain("Transactions");
    expect(html).toContain("2 rows in October 2026.");
  });

  it("uses the month control, with links to the months either side", () => {
    const html = render(data([line()]));

    expect(html).toContain("October 2026");
    expect(html).toMatch(
      /href="\/transactions\?month=2026-09"[^>]*aria-label="Previous month"|aria-label="Previous month"[^>]*href="\/transactions\?month=2026-09"/,
    );
    expect(html).toMatch(
      /href="\/transactions\?month=2026-11"[^>]*aria-label="Next month"|aria-label="Next month"[^>]*href="\/transactions\?month=2026-11"/,
    );
  });

  it("has no view switch, because rows aren't split by budget view", () => {
    expect(render(data([line()]))).not.toContain("Budget view");
  });

  it("offers Edit on each row, on a laptop and on a phone", () => {
    const html = render(data([line()]));

    expect(html.match(/aria-label="Edit CORNER MARKET"/g)).toHaveLength(2);
  });

  it("names the row's label on its Edit action", () => {
    const html = render(
      data([line({ title: "Corner shop", bankText: "CORNER MARKET" })]),
    );

    expect(html).toContain('aria-label="Edit Corner shop"');
  });

  it("shows a table for a laptop and a list for a phone", () => {
    const html = render(data([line()]));

    expect(html).toMatch(/<section[^>]*hidden[^>]*md:block[^>]*>/);
    expect(html).toMatch(/<section[^>]*md:hidden[^>]*>/);
    for (const head of [
      "Date",
      "Description",
      "Account",
      "Type",
      "Category",
      "Amount",
      "Actions",
    ]) {
      expect(html).toContain(`>${head}</th>`);
    }
  });

  it("shows the label first with the bank text under it", () => {
    const html = render(
      data([line({ title: "Corner shop", bankText: "CORNER MARKET" })]),
    );

    expect(html.indexOf("Corner shop")).toBeGreaterThan(-1);
    expect(html.indexOf("Corner shop")).toBeLessThan(
      html.indexOf("CORNER MARKET"),
    );
  });

  it("shows the bank text alone when there's no label", () => {
    expect(render(data([line()]))).toContain("CORNER MARKET");
  });

  it("shows the USD amount first, with the other amount muted under it", () => {
    const html = render(
      data([line({ amount: "-$13.14", original: "-€12.00" })]),
    );

    expect(html).toMatch(
      /-\$13\.14<\/div><div class="[^"]*text-muted-foreground[^"]*">-€12\.00</,
    );
  });

  it("shows Needs Review for a row with no type", () => {
    const html = render(
      data([
        line({
          type: null,
          typeLabel: null,
          categoryId: null,
          category: null,
          needsReview: true,
        }),
      ]),
    );

    expect(html).toContain("Needs Review</span>");
    expect(html).not.toContain(">Spending</span>");
  });

  it("shows Needs Review for spending with no category, keeping its type", () => {
    const html = render(
      data([line({ categoryId: null, category: null, needsReview: true })]),
    );

    expect(html).toContain("Needs Review</span>");
    expect(html).toContain(">Spending</span>");
  });

  it("shows no Needs Review on a reviewed row", () => {
    const html = render(data([line()]));

    expect(html).not.toMatch(/>Needs Review<\/span>/);
  });

  it("shows no Needs Review on a hidden row with no type", () => {
    const html = render(
      data([
        line({
          type: null,
          typeLabel: null,
          categoryId: null,
          category: null,
          hidden: true,
          needsReview: false,
        }),
      ]),
    );

    expect(html).not.toMatch(/>Needs Review<\/span>/);
  });

  it("shows that a row is in a transfer pair", () => {
    const html = render(
      data([
        line({
          type: "transfer",
          typeLabel: "Transfer",
          categoryId: null,
          category: null,
          paired: true,
        }),
      ]),
    );

    expect(html).toContain("Paired");
  });

  it("says nothing about pairs on a row with no pair", () => {
    expect(render(data([line()]))).not.toContain("Paired");
  });

  it("leaves hidden rows out to start with", () => {
    const html = render(
      data([line(), line({ id: "t2", title: "GONE ROW", hidden: true })]),
    );

    expect(html).not.toContain("GONE ROW");
  });

  it("tells an empty month to import a statement", () => {
    const html = render(data([]), "2026-03");

    expect(html).toContain("No rows in March 2026");
    expect(html).toContain(
      "Import a statement that covers this month to see its rows.",
    );
    expect(html).toMatch(/href="\/import"[^>]*>Go to Import</);
    expect(html).not.toContain("Clear Filters");
  });

  it("offers no filters for an empty month", () => {
    expect(render(data([]))).not.toContain("Search this month");
  });

  it("says when every row in the month is hidden, and leaves the filters there", () => {
    const html = render(data([line({ hidden: true })]));

    expect(html).toContain("All rows in October 2026 are hidden");
    expect(html).toContain("Select Show Hidden to see them.");
    expect(html).toContain("Search this month");
  });

  it("filters to the account in the URL", () => {
    url.search = new URLSearchParams("month=2026-10&account=acc-giro");
    const html = render(
      data([
        line({ title: "CARD ROW" }),
        line({ id: "t2", title: "GIRO ROW", accountId: "acc-giro", account: "DE Giro" }),
      ]),
    );

    expect(html).toContain("GIRO ROW");
    expect(html).not.toContain("CARD ROW");
    expect(html).toContain("1 row in October 2026.");
    expect(html).toContain('<option value="acc-giro" selected="">DE Giro</option>');
  });

  it("shows every account for an account in the URL that isn't one", () => {
    url.search = new URLSearchParams("account=acc-gone");
    const html = render(data([line(), line({ id: "t2", accountId: "acc-giro" })]));

    expect(html).toContain("2 rows in October 2026.");
    expect(html).toMatch(/<option value=""[^>]*selected[^>]*>All Accounts/);
  });

  it("filters to the type and category in the URL", () => {
    url.search = new URLSearchParams("type=spending&category=cat-dining");
    const html = render(
      data([
        line({ title: "GROCER ROW" }),
        line({ id: "t2", title: "CAFE ROW", categoryId: "cat-dining", category: "Dining" }),
      ]),
    );

    expect(html).toContain("CAFE ROW");
    expect(html).not.toContain("GROCER ROW");
    expect(html).toContain('<option value="spending" selected="">Spending</option>');
    expect(html).toContain('<option value="cat-dining" selected="">Dining</option>');
  });

  it("keeps the URL's filters on the links to the months either side", () => {
    url.search = new URLSearchParams("account=acc-giro&type=spending&category=cat-dining");
    const html = render(data([line()]));

    expect(html).toContain(
      'href="/transactions?month=2026-09&amp;account=acc-giro&amp;type=spending&amp;category=cat-dining"',
    );
  });

  it("shows a message with no row data when the month can't load", () => {
    const html = render(null);

    expect(html).toContain(
      "This month can&#x27;t be loaded. Reload the page to try again.",
    );
    expect(html).toContain("October 2026");
  });

  it("keeps the URL's filters on the month links when the month can't load", () => {
    url.search = new URLSearchParams("account=acc-giro&type=spending&category=cat-dining");
    const html = render(null);

    expect(html).toContain(
      'href="/transactions?month=2026-09&amp;account=acc-giro&amp;type=spending&amp;category=cat-dining"',
    );
    expect(html).toContain(
      'href="/transactions?month=2026-11&amp;account=acc-giro&amp;type=spending&amp;category=cat-dining"',
    );
  });

  it("leaves a category off the month links unless the type is Spending, when the month can't load", () => {
    url.search = new URLSearchParams("account=acc-giro&type=income&category=cat-dining");
    const html = render(null);

    expect(html).toContain(
      'href="/transactions?month=2026-09&amp;account=acc-giro&amp;type=income"',
    );
  });
});

describe("MonthRows", () => {
  it("clears the filters when Clear Filters is used, keeping Show Hidden", () => {
    const onChange = vi.fn();
    const rows = MonthRows({
      lines: [],
      empty: { kind: "filters", title: "No rows match these filters" },
      filters: {
        ...NO_FILTERS,
        search: "cafe",
        accountId: "acc-card",
        type: "spending",
        categoryId: "cat-dining",
        needsReview: true,
        showHidden: true,
      },
      onChange,
      onEdit: () => {},
    });

    const [clear] = buttonsNamed(rows, "Clear Filters");
    clear.props.onClick();

    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, showHidden: true });
  });
});

describe("EditButton", () => {
  it("says which row to edit", () => {
    const onEdit = vi.fn();
    const button = EditButton({ line: line({ id: "t7" }), onEdit });

    (button as ControlElement).props.onClick();

    expect(onEdit).toHaveBeenCalledWith("t7");
  });
});

describe("TransactionFiltersBar", () => {
  it("offers a search of the month", () => {
    const html = renderFilters(NO_FILTERS);

    expect(html).toContain('placeholder="Search this month"');
    expect(html).toContain('type="search"');
  });

  it("offers every account and every type", () => {
    const html = renderFilters(NO_FILTERS);

    for (const option of [
      "All Accounts",
      "DE Giro",
      "US Card",
      "All Types",
      "Spending",
      "Income",
      "Transfer",
      "Saved",
      "Personal",
    ]) {
      expect(html).toContain(`>${option}</option>`);
    }
  });

  it("offers Needs Review and Show Hidden", () => {
    const html = renderFilters(NO_FILTERS);

    expect(html).toContain("Needs Review");
    expect(html).toContain("Show Hidden");
  });

  it("has no category filter until the type is Spending", () => {
    expect(renderFilters(NO_FILTERS)).not.toContain("All Categories");
    expect(renderFilters({ ...NO_FILTERS, type: "income" })).not.toContain(
      "All Categories",
    );
  });

  it("shows the category filter for Spending, starting at All Categories", () => {
    const html = renderFilters({ ...NO_FILTERS, type: "spending" });

    expect(html).toMatch(/<option value=""[^>]*selected[^>]*>All Categories/);
    expect(html).toContain(">Groceries</option>");
    expect(html).toContain(">Dining</option>");
  });

  it("clears the category when the type changes", () => {
    const start: TransactionFilters = {
      ...NO_FILTERS,
      type: "spending",
      categoryId: "cat-dining",
    };
    const onChange = vi.fn();
    const bar = TransactionFiltersBar({
      filters: start,
      accounts: data([]).accounts,
      categories: data([]).categories,
      onChange,
    });

    const [typeSelect] = controlsNamed(bar, "Type");
    typeSelect.props.onChange({ target: { value: "income" } });

    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTERS, type: "income" });
  });

  it("names each control for a screen reader", () => {
    const html = renderFilters({ ...NO_FILTERS, type: "spending" });

    for (const name of ["Search this month", "Account", "Type", "Category"]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
  });
});
