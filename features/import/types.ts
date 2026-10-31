import type { Money } from "@/lib/money";

export type StatementFormat = "chase-bank" | "chase-card" | "commerzbank";

export type Account = {
  id: string;
  lastFour: string;
  format: StatementFormat;
  currency: string;
};

export type Hash = (input: string) => string | Promise<string>;

export type OriginalAmount = {
  amount: Money;
  /** A decimal string with a dot, never a float. */
  rate?: string;
};

/** A cleaned row, with negative meaning money out on every format. */
export type StatementRow = {
  postedOn: string;
  purchasedOn?: string;
  amount: Money;
  description: string;
  purpose?: string;
  original?: OriginalAmount;
  bankType?: string;
  bankCategory?: string;
  ppdId?: string;
  orderingPartyId?: string;
  transferNumber?: string;
  balance?: Money;
};

export type Transaction = StatementRow & {
  accountId: string;
  fingerprint: string;
};

export type ParsedStatement = {
  accountId: string;
  format: StatementFormat;
  transactions: Transaction[];
  ignoredPendingCount: number;
};

export type StatementSource = { fileName: string; text: string };

export type AdapterResult = {
  rows: StatementRow[];
  ignoredPendingCount: number;
};

export type StatementAdapter = {
  id: StatementFormat;
  detect: (headerRow: string) => boolean;
  /** Finds the account's last four digits, or null if the file doesn't show them. */
  lastFour: (source: StatementSource) => string | null;
  parse: (text: string, account: Account) => AdapterResult;
};
