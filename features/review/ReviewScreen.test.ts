import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountRow, CategoryRow } from "@/features/budget/rows";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import { buildReviewInbox, type ReviewInbox } from "./reviewInbox";
import { ReviewScreen } from "./ReviewScreen";
import type { ReviewSection } from "./sections";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

vi.mock("@/hooks/use-server-action", () => ({
  useServerAction: () => ({ pending: false, run: vi.fn() }),
}));

const ACCOUNTS: AccountRow[] = [
  { id: "acc-card", name: "US Card", country: "US" },
  { id: "acc-de", name: "DE Giro", country: "DE" },
];

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
];

let nextId = 0;

function row(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  nextId += 1;
  return {
    id: `t${nextId}`,
    accountId: "acc-card",
    fingerprint: `fingerprint-${nextId}`,
    postedOn: "2026-10-28",
    amount: { minor: -6418, currency: "USD" },
    base: { minor: -6418, currency: "USD" },
    description: "CORNER MARKET",
    purpose: "Card payment",
    bankType: "Sale",
    bankCategory: "Groceries",
    type: null,
    categoryId: null,
    categorySource: null,
    suggestedCategoryId: null,
    note: null,
    hidden: false,
    possibleDuplicate: false,
    transferPairId: null,
    ...extra,
  };
}

const ROWS: StoredTransaction[] = [
  row({ type: "spending", categoryId: "cat-groceries", categorySource: "manual" }),
  row(),
  row(),
  row({ description: "RIVERSIDE CAFE" }),
  row({ description: "[REDACTED]", accountId: "acc-de", purpose: "Invoice sample" }),
  row({ description: "", accountId: "acc-de", purpose: undefined }),
];

function inbox(rows: readonly StoredTransaction[] = ROWS): ReviewInbox {
  return buildReviewInbox({
    rows,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    thisMonth: "2026-11",
  });
}

function render(
  screen: ReviewInbox | null = inbox(),
  section: ReviewSection = "merchants",
) {
  return renderToStaticMarkup(createElement(ReviewScreen, { inbox: screen, section }));
}

describe("ReviewScreen", () => {
  it("says how many rows are left", () => {
    const html = render();

    expect(html).toContain("Review Inbox");
    expect(html).toContain("5 rows left.");
  });

  it("has a Merchants and a No Merchant section, with counts, as links", () => {
    const html = render();

    expect(html).toMatch(
      /<a aria-current="page"[^>]*href="\/review">Merchants<span[^>]*>2</,
    );
    expect(html).toMatch(
      /<a class="[^"]*" href="\/review\?section=no-merchant">No Merchant<span[^>]*>2</,
    );
    expect(html).not.toContain("Possible Transfers");
    expect(html).not.toContain("Possible Duplicates");
  });

  describe("Merchants", () => {
    it("opens only the largest group", () => {
      const html = render();

      expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
      expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
      expect(html).toMatch(/aria-expanded="true"[\s\S]*CORNER MARKET[\s\S]*aria-expanded="false"[\s\S]*RIVERSIDE CAFE/);
    });

    it("has one violet action, Accept, which waits for a category", () => {
      const html = render();

      expect(html.match(/(?<![:\w-])bg-primary(?![/\w-])/g)).toHaveLength(1);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Accept 2 Rows<\/button>/);
    });

    it("offers the suggestion without filling it in", () => {
      const html = render();

      expect(html).toContain("Suggested: Groceries");
      expect(html).toMatch(/<button[^>]*>Use<\/button>/);
      expect(html).toMatch(/id="[^"]*-category"[^>]*>(?:(?!<\/select>)[\s\S])*<option value="" selected="">Select a category<\/option>/);
    });

    it("shows each row's bank details in a table with every column", () => {
      const html = render();

      for (const head of [
        "Date",
        "Description",
        "Purpose",
        "Account",
        "Bank Type",
        "Bank Category",
        "Amount",
      ]) {
        expect(html).toContain(`>${head}</th>`);
      }
      expect(html).toContain("Card payment");
      expect(html).toContain("US Card");
      expect(html).toContain("-$64.18");
    });

    it("lets the owner change a single row", () => {
      expect(render()).toContain('aria-label="Change CORNER MARKET from Oct 28"');
    });

    it("keeps wide tables inside their card, so the page can't scroll sideways", () => {
      expect(render()).toMatch(/overflow-x-auto[\s\S]*min-w-\[880px\]/);
    });

    it("says when every merchant is reviewed but No Merchant rows are left", () => {
      const html = render(inbox([row({ description: "" })]));

      expect(html).toContain("All merchants are reviewed.");
    });
  });

  describe("No Merchant", () => {
    const html = render(inbox(), "no-merchant");

    it("explains why each row is on its own", () => {
      expect(html).toContain(
        "These rows have no merchant to group by, so each one takes its own decision.",
      );
    });

    it("has no Accept, only a Save Row per row", () => {
      expect(html).not.toContain("Accept");
      expect(html.match(/>Save Row</g)).toHaveLength(2);
    });

    it("has a Label field with an example", () => {
      expect(html).toMatch(/>Label<\/label>/);
      expect(html).toContain('placeholder="Corner Market"');
      expect(html).toContain('maxLength="100"');
      expect(html).not.toContain("Your Label");
    });

    it("says where a number removed at import can be found", () => {
      expect(
        html.match(/A number was removed from this text at import/g),
      ).toHaveLength(1);
      expect(html).toContain("Your bank statement has it.");
    });

    it("names a row with no text", () => {
      expect(html).toContain("No description");
    });

    it("has no violet action", () => {
      expect(html).not.toMatch(/(?<![:\w-])bg-primary(?![/\w-])/);
    });

    it("says when it's empty", () => {
      expect(render(inbox([row()]), "no-merchant")).toContain("No rows here.");
    });
  });

  describe("an empty inbox", () => {
    it("reads as done", () => {
      const html = render(
        inbox([
          row({ type: "spending", categoryId: "cat-groceries", categorySource: "manual" }),
        ]),
      );

      expect(html).toContain("All rows are reviewed");
      expect(html).toContain("Nothing left to review.");
      expect(html).not.toContain("No Merchant");
    });

    it("points to Import before the first import", () => {
      const html = render(inbox([]));

      expect(html).toContain("Nothing to review yet");
      expect(html).toContain('href="/import"');
    });
  });

  it("says so when the inbox can't be loaded", () => {
    expect(render(null)).toContain(
      "The inbox can&#x27;t be loaded. Reload the page to try again.",
    );
  });
});
