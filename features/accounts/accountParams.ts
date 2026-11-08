import { isMonth } from "@/features/budget/budget";
import { shortcutPeriod, type PeriodChoice } from "./period";

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The default period, and the one a bad or reversed period falls back to. */
export const DEFAULT_SHORTCUT = "last-3-months";

/** Holds only the ID of the account the owner looked at last. */
export const LAST_ACCOUNT_COOKIE = "last-account";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** An account ID is a UUID, so anything else in the cookie is ignored. */
const ID_SHAPE = /^[A-Za-z0-9-]{1,64}$/;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function readPeriod(params: SearchParams, today: string): PeriodChoice {
  const period = params.period;
  if (period !== undefined) {
    return single(period) === "all"
      ? { kind: "all" }
      : shortcutPeriod(DEFAULT_SHORTCUT, today);
  }

  const from = single(params.from);
  const to = single(params.to);
  if (from !== null && to !== null && isMonth(from) && isMonth(to) && from <= to) {
    return { kind: "range", from, to };
  }
  return shortcutPeriod(DEFAULT_SHORTCUT, today);
}

/**
 * The account and period the Account page shows. With no account in the address,
 * it's the last account viewed. The screen builder falls back to the first account
 * when that's missing or no longer exists.
 */
export function readAccountParams(
  params: SearchParams,
  lastAccount: string | null | undefined,
  today: string,
): { accountId: string | null; period: PeriodChoice } {
  const remembered =
    typeof lastAccount === "string" && ID_SHAPE.test(lastAccount)
      ? lastAccount
      : null;

  return {
    accountId: single(params.account) ?? remembered,
    period: readPeriod(params, today),
  };
}

export function accountHref(accountId: string, period?: PeriodChoice): string {
  const query = new URLSearchParams({ account: accountId });
  if (period?.kind === "all") query.set("period", "all");
  if (period?.kind === "range") {
    query.set("from", period.from);
    query.set("to", period.to);
  }
  return `/accounts?${query}`;
}

/** Set in the browser once a page shows the account. */
export function lastAccountCookie(accountId: string): string {
  return `${LAST_ACCOUNT_COOKIE}=${encodeURIComponent(accountId)}; path=/accounts; max-age=${ONE_YEAR}; samesite=lax`;
}
