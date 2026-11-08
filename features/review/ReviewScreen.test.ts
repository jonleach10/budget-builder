import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountRow, CategoryRow } from "@/features/budget/rows";
import type { PairingAccount } from "@/features/categorize/pairTransfers";
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
  { id: "acc-checking", name: "US Checking", country: "US" },
  { id: "acc-savings", name: "US Savings", country: "US" },
];

const PAIRING_ACCOUNTS: PairingAccount[] = [
  { id: "acc-card", format: "chase-card" },
  { id: "acc-de", format: "commerzbank" },
  { id: "acc-checking", format: "chase-bank" },
  { id: "acc-savings", format: "chase-bank" },
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

function moved(
  accountId: string,
  minor: number,
  extra: Partial<StoredTransaction> = {},
): StoredTransaction {
  return row({
    accountId,
    description: "ONLINE TRANSFER",
    purpose: undefined,
    bankType: undefined,
    bankCategory: undefined,
    amount: { minor, currency: "USD" },
    base: { minor, currency: "USD" },
    ...extra,
  });
}

/** One same-amount pair, and a card payment with two bank rows that could match it. */
const MATCH_ROWS: StoredTransaction[] = [
  moved("acc-checking", -50000, { postedOn: "2026-10-16" }),
  moved("acc-savings", 50000, { postedOn: "2026-10-17" }),
  moved("acc-card", 81240, {
    postedOn: "2026-10-25",
    description: "PAYMENT THANK YOU",
    bankType: "Payment",
  }),
  moved("acc-checking", -81240, { postedOn: "2026-10-24", description: "CARD PAYMENT" }),
  moved("acc-checking", -81240, { postedOn: "2026-10-26", description: "SAMPLE RENT" }),
];

const DUPLICATE_ROWS: StoredTransaction[] = [
  row({ description: "TRANSIT PASS", possibleDuplicate: true, postedOn: "2026-10-11" }),
];

function inbox(rows: readonly StoredTransaction[] = ROWS): ReviewInbox {
  return buildReviewInbox({
    rows,
    accounts: ACCOUNTS,
    pairingAccounts: PAIRING_ACCOUNTS,
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

  it("has four sections, with counts, as links", () => {
    const html = render(inbox([...ROWS, ...MATCH_ROWS, ...DUPLICATE_ROWS]));

    expect(html).toMatch(
      /<a aria-current="page"[^>]*href="\/review">(?:<span[^>]*>Merchants<\/span>)+<span[^>]*>3</,
    );
    expect(html).toMatch(
      /href="\/review\?section=no-merchant">(?:<span[^>]*>No Merchant<\/span>)+<span[^>]*>2</,
    );
    expect(html).toMatch(
      /href="\/review\?section=transfers"><span[^>]*>Possible Transfers<\/span><span[^>]*>Transfers<\/span><span[^>]*>2</,
    );
    expect(html).toMatch(
      /href="\/review\?section=duplicates"><span[^>]*>Possible Duplicates<\/span><span[^>]*>Duplicates<\/span><span[^>]*>1</,
    );
  });

  it("shows the full tab labels from tablet width up, and the short ones on a phone", () => {
    const html = render();

    expect(html).toMatch(/<span class="hidden md:inline">Possible Transfers<\/span>/);
    expect(html).toMatch(/<span class="md:hidden">Transfers<\/span>/);
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

    it("has Change All beside Accept, as an outlined button, only on the open group", () => {
      const html = render();

      expect(html.match(/>Change All<\/button>/g)).toHaveLength(1);
      const [, changeAll] =
        html.match(/<button([^>]*)>Change All<\/button><button[^>]*>Accept 2 Rows<\/button>/) ?? [];
      expect(changeAll).toContain("shadow-hairline");
      expect(changeAll).not.toMatch(/(?<![:\w-])bg-primary(?![/\w-])/);
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

  describe("Possible Transfers", () => {
    const html = render(inbox(MATCH_ROWS), "transfers");

    it("explains what a match is and how a row leaves it", () => {
      expect(html).toContain(
        "These rows may be one transfer. A transfer stays out of your budget. Give a row a type to take it out of the match.",
      );
    });

    it("shows each match with its reason, newest first", () => {
      expect(html).toMatch(
        /<section aria-label="Card Payment"[\s\S]*<h2[^>]*>Card Payment<\/h2>[\s\S]*Select the two rows that belong together\.[\s\S]*<section aria-label="Same Amount Within 3 Days"/,
      );
    });

    it("picks both rows of a pair, and none of a larger match", () => {
      const boxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(
        ([box]) => box.includes('checked=""'),
      );

      expect(boxes).toEqual([false, false, false, true, true]);
    });

    it("names each row's checkbox and type picker", () => {
      expect(html).toContain('aria-label="Select CARD PAYMENT from Oct 24"');
      expect(html).toContain('aria-label="Set type for CARD PAYMENT from Oct 24"');
    });

    it("can mark a pair now, and a larger match once two rows are picked", () => {
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark as Transfer<\/button>[\s\S]*<button(?![^>]*disabled="")[^>]*>Mark as Transfer<\/button>/);
    });

    it("offers every type but Transfer to take a row out", () => {
      const [picker] = html.match(/<select[^>]*aria-label="Set type for[\s\S]*?<\/select>/) ?? [];

      expect(picker).toContain(">Set Type</option>");
      for (const label of ["Spending", "Income", "Saved", "Personal"]) {
        expect(picker).toContain(`>${label}</option>`);
      }
      expect(picker).not.toContain(">Transfer</option>");
    });

    it("shows each row's account and amount", () => {
      expect(html).toContain("US Savings");
      expect(html).toContain("$500.00");
      expect(html).toContain("-$812.40");
    });

    it("has no violet action", () => {
      expect(html).not.toMatch(/(?<![:\w-])bg-primary(?![/\w-])/);
    });

    it("says when it's empty", () => {
      expect(render(inbox(), "transfers")).toContain("No possible transfers.");
    });
  });

  describe("Possible Duplicates", () => {
    const html = render(inbox([...ROWS, ...DUPLICATE_ROWS]), "duplicates");

    it("explains that a duplicate counts until it's hidden", () => {
      expect(html).toContain(
        "These rows match another row in the same file. They stay in your totals until you hide one. A row can appear here and under Merchants.",
      );
    });

    it("has Dismiss and Hide Row for each row, named by the row", () => {
      expect(html).toContain('aria-label="Dismiss TRANSIT PASS from Oct 11"');
      expect(html).toContain('aria-label="Hide Row for TRANSIT PASS from Oct 11"');
      expect(html).toMatch(/>Dismiss<\/button>/);
      expect(html).toMatch(/>Hide Row<\/button>/);
    });

    it("shows the rows in a table, with the amount", () => {
      for (const head of ["Date", "Description", "Account", "Amount", "Actions"]) {
        expect(html).toContain(`>${head}</th>`);
      }
      expect(html).toContain("-$64.18");
    });

    it("has no violet action", () => {
      expect(html).not.toMatch(/(?<![:\w-])bg-primary(?![/\w-])/);
    });

    it("says when it's empty", () => {
      expect(render(inbox(), "duplicates")).toContain("No possible duplicates.");
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
