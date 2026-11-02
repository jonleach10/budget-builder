import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { EditRowDialog, EditRowFields, EditRowForm } from "./EditRow";
import { rowForm, type RowForm } from "./rowEditForm";
import type { TransactionLine } from "./transactionsScreenData";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const CATEGORIES = [
  { id: "cat-groceries", name: "Groceries" },
  { id: "cat-dining", name: "Dining" },
];

function line(extra: Partial<TransactionLine> = {}): TransactionLine {
  return {
    id: "t1",
    date: "Oct 28",
    title: "CORNER MARKET",
    bankText: null,
    purpose: null,
    bankType: "Sale",
    bankCategory: "Groceries",
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

const PAIRED = line({
  type: "transfer",
  typeLabel: "Transfer",
  categoryId: null,
  category: null,
  paired: true,
  pairedWith: "US Checking, -$812.40",
});

function fieldsProps(row: TransactionLine, form: RowForm = rowForm(row)) {
  return {
    line: row,
    form,
    categories: CATEGORIES,
    fieldId: "edit",
    onChange: () => {},
  };
}

function renderFields(row: TransactionLine, form?: RowForm) {
  return renderToStaticMarkup(createElement(EditRowFields, fieldsProps(row, form)));
}

function renderForm(row: TransactionLine) {
  return renderToStaticMarkup(
    createElement(
      Dialog,
      { open: true },
      createElement(EditRowForm, {
        line: row,
        categories: CATEGORIES,
        onClose: () => {},
      }),
    ),
  );
}

type Control = ReactElement<{
  id?: string;
  children?: ReactNode;
  onChange: (change: { target: { value: string } } | boolean) => void;
}>;

/** Finds a control by its ID, so a test can use it with no browser. */
function controlById(node: ReactNode, id: string): Control | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    const element = child as Control;
    if (element.props.id === id) return element;
    const found = controlById(element.props.children, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function use(id: string, row: TransactionLine, value: string) {
  const onChange = vi.fn();
  const fields = EditRowFields({ ...fieldsProps(row), onChange });

  controlById(fields, id)?.props.onChange({ target: { value } });

  return onChange;
}

describe("the bank's fields", () => {
  it("show above the editable ones", () => {
    const html = renderFields(line());

    expect(html.indexOf("Bank Text")).toBeGreaterThan(-1);
    expect(html.indexOf("Bank Text")).toBeLessThan(html.indexOf("Your Label"));
    expect(html.indexOf("Bank Category")).toBeLessThan(
      html.indexOf("Your Label"),
    );
  });

  it("are read-only", () => {
    const [bankFields] = renderFields(line()).split("Your Label");

    expect(bankFields).not.toMatch(/<(input|select|textarea)/);
  });

  it("show each field by name", () => {
    const html = renderFields(
      line({ purpose: "Card payment", bankType: "Debit", bankCategory: "Food" }),
    );

    for (const fact of [
      ["Bank Text", "CORNER MARKET"],
      ["Amount", "-$64.18"],
      ["Date", "Oct 28"],
      ["Account", "US Card"],
      ["Purpose", "Card payment"],
      ["Bank Type", "Debit"],
      ["Bank Category", "Food"],
    ]) {
      expect(html).toMatch(
        new RegExp(
          `<dt[^>]*>${fact[0]}</dt><dd[^>]*>(<span[^>]*>)?${fact[1].replace("$", "\\$")}`,
        ),
      );
    }
  });

  it("show the bank text, not the label, on a row with a label", () => {
    const html = renderFields(
      line({ title: "Corner shop", bankText: "CORNER MARKET" }),
    );

    expect(html).toMatch(
      /<dt[^>]*>Bank Text<\/dt><dd[^>]*><span[^>]*>CORNER MARKET/,
    );
  });

  it("show a hyphen for what the bank didn't give", () => {
    const html = renderFields(line({ bankType: null, bankCategory: null }));

    expect(html).toMatch(/<dt[^>]*>Purpose<\/dt><dd[^>]*>-</);
    expect(html).toMatch(/<dt[^>]*>Bank Type<\/dt><dd[^>]*>-</);
    expect(html).toMatch(/<dt[^>]*>Bank Category<\/dt><dd[^>]*>-</);
  });

  it("show the same two amounts as the row, so the sign rule stays in one place", () => {
    const html = renderFields(line({ amount: "-$13.14", original: "-€12.00" }));

    expect(html).toContain("-$13.14");
    expect(html).toContain("-€12.00");
  });
});

describe("the editable fields", () => {
  it("offer Your Label, capped at 100 characters", () => {
    const html = renderFields(line());

    expect(html).toContain(">Your Label</label>");
    expect(html).toContain('maxLength="100"');
    expect(html).toContain('placeholder="Name of the payee"');
    expect(html).toContain(
      "Shows first on this row. The bank text stays under it.",
    );
  });

  it("start with the row's label, not its bank text", () => {
    const html = renderFields(
      line({ title: "Corner shop", bankText: "CORNER MARKET" }),
    );

    expect(html).toContain('value="Corner shop"');
  });

  it("offer every type and No Type", () => {
    const html = renderFields(line());

    for (const option of [
      "No Type",
      "Spending",
      "Income",
      "Transfer",
      "Saved",
      "Personal",
    ]) {
      expect(html).toContain(`>${option}</option>`);
    }
  });

  it("offer every category and No Category", () => {
    const html = renderFields(line());

    for (const option of ["No Category", "Groceries", "Dining"]) {
      expect(html).toContain(`>${option}</option>`);
    }
  });

  it("leave the category open on spending", () => {
    expect(renderFields(line())).not.toMatch(/<select[^>]*\sdisabled=""/);
  });

  it("make the category unavailable on any other type", () => {
    const row = line({ type: "income", typeLabel: "Income", categoryId: null });

    expect(renderFields(row)).toMatch(/<select[^>]*\sdisabled=""/);
  });

  it("offer hiding as a checkbox", () => {
    const html = renderFields(line());

    expect(html).toContain("Hide this row from totals");
    expect(html).toMatch(/type="checkbox"/);
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it("show a hidden row's checkbox as selected, so clearing it brings the row back", () => {
    expect(renderFields(line({ hidden: true }))).toMatch(
      /type="checkbox"[^>]*checked/,
    );
  });

  it("change the label", () => {
    expect(use("edit-label", line(), "Corner shop")).toHaveBeenCalledWith({
      ...rowForm(line()),
      label: "Corner shop",
    });
  });

  it("clear the category when the type changes", () => {
    expect(use("edit-type", line(), "income")).toHaveBeenCalledWith({
      ...rowForm(line()),
      type: "income",
      categoryId: "",
    });
  });

  it("change the category", () => {
    expect(use("edit-category", line(), "cat-dining")).toHaveBeenCalledWith({
      ...rowForm(line()),
      categoryId: "cat-dining",
    });
  });

  it("change the hidden state", () => {
    const onChange = vi.fn();
    const fields = EditRowFields({ ...fieldsProps(line()), onChange });

    controlById(fields, "edit-hidden")?.props.onChange(true);

    expect(onChange).toHaveBeenCalledWith({
      ...rowForm(line()),
      hidden: true,
    });
  });
});

describe("a paired row", () => {
  it("shows no warning until its type changes", () => {
    expect(renderFields(PAIRED)).not.toContain("removes this row&#x27;s pair");
  });

  it("warns before saving when its type changes", () => {
    const html = renderFields(PAIRED, {
      ...rowForm(PAIRED),
      type: "income",
    });

    expect(html).toContain(
      "Changing the type removes this row&#x27;s pair with US Checking, -$812.40. That row goes back to review.",
    );
  });
});

describe("EditRowForm", () => {
  it("has a title, Save Row as the one main action, and Cancel", () => {
    const html = renderForm(line());

    expect(html).toContain(">Edit Row</h2>");
    expect(html).toMatch(/type="submit"[^>]*>Save Row</);
    expect(html).toContain(">Cancel</button>");
  });

  it("offers Close for a phone, where it fills the screen", () => {
    expect(renderForm(line())).toMatch(
      /<button[^>]*md:hidden[^>]*aria-label="Close"|<button[^>]*aria-label="Close"[^>]*md:hidden/,
    );
  });

  it("stacks its actions on a phone with Save Row first", () => {
    expect(renderForm(line())).toMatch(/max-md:flex-col-reverse/);
  });

  it("holds no failure message to start with", () => {
    expect(renderForm(line())).not.toContain("wasn&#x27;t saved");
  });
});

describe("EditRowDialog", () => {
  const dialog = EditRowDialog({
    line: line(),
    categories: CATEGORIES,
    onClose: () => {},
  }) as ReactElement<{ children: ReactElement<{ className: string }> }>;

  it("fills a phone's screen and is 560px wide above that", () => {
    const { className } = dialog.props.children.props;

    expect(className).toContain("max-w-[560px]");
    expect(className).toContain("max-md:h-dvh");
    expect(className).toContain("max-md:w-full");
    expect(className).toContain("max-md:rounded-none");
  });
});
