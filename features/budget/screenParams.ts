import { isMonth, type Country } from "./budget";

export const VIEWS = ["us", "germany", "combined"] as const;

export type BudgetView = (typeof VIEWS)[number];

export const VIEW_LABELS: Record<BudgetView, string> = {
  us: "US",
  germany: "Germany",
  combined: "Combined",
};

/** The country a view edits. Combined has none, so it's read-only. */
export function countryOf(view: BudgetView): Country | null {
  if (view === "combined") return null;
  return view === "us" ? "US" : "DE";
}

export type ScreenParams = { month: string; view: BudgetView };

type RawParams = Readonly<Record<string, string | string[] | undefined>>;

function isView(text: string): text is BudgetView {
  return (VIEWS as readonly string[]).includes(text);
}

/** A bad or repeated value falls back to the current month or to US. */
export function readScreenParams(
  raw: RawParams,
  current: string,
): ScreenParams {
  const { month, view } = raw;
  return {
    month: typeof month === "string" && isMonth(month) ? month : current,
    view: typeof view === "string" && isView(view) ? view : "us",
  };
}

export function screenHref(path: string, params: ScreenParams): string {
  const query = new URLSearchParams({
    month: params.month,
    view: params.view,
  });
  return `${path}?${query}`;
}
