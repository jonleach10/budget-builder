import { isTransactionType } from "@/features/rules/rules";
import type { TransactionFilters } from "./filterTransactions";

type RawParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * The filters Transactions keeps in its URL, so a filtered list survives a reload
 * and can be linked to. Search, Needs Review and Show Hidden stay on the screen.
 */
export type UrlFilters = Pick<TransactionFilters, "accountId" | "type" | "categoryId">;

type Known = {
  accounts: readonly { id: string }[];
  categories: readonly { id: string }[];
};

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * The URL's filters without checking the account or category is one, for a month
 * that can't load, which has none to check them against. A bad or repeated value
 * means All, and a category only counts under Spending.
 */
export function carriedTransactionFilters(raw: RawParams): UrlFilters {
  const type = single(raw.type);

  return {
    accountId: single(raw.account),
    type: isTransactionType(type) ? type : "",
    categoryId: type === "spending" ? single(raw.category) : "",
  };
}

/**
 * A bad, unknown or repeated value means All, as in All Accounts. A category only
 * counts under Spending, as the screen's Category filter does.
 */
export function readTransactionFilters(
  raw: RawParams,
  { accounts, categories }: Known,
): UrlFilters {
  const { accountId, type, categoryId } = carriedTransactionFilters(raw);
  const known = (rows: Known["accounts"], id: string) =>
    rows.some((row) => row.id === id);

  return {
    accountId: known(accounts, accountId) ? accountId : "",
    type,
    categoryId: known(categories, categoryId) ? categoryId : "",
  };
}

/** A Transactions month, with whichever of the URL's filters are set. */
export function transactionsHref(
  month: string,
  filters: Partial<UrlFilters> = {},
): string {
  const { accountId = "", type = "", categoryId = "" } = filters;
  const query = new URLSearchParams({ month });
  if (accountId !== "") query.set("account", accountId);
  if (type !== "") query.set("type", type);
  if (type === "spending" && categoryId !== "") query.set("category", categoryId);
  return `/transactions?${query}`;
}

/** The browser's URL values in the shape the server's search params take. */
export function paramsOf(search: URLSearchParams | null): RawParams {
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(search?.keys() ?? [])) {
    const values = search?.getAll(key) ?? [];
    params[key] = values.length === 1 ? values[0] : values;
  }
  return params;
}
