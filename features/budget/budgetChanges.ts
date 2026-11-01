import type { ActionResult } from "@/lib/actionResult";
import { checkAmount } from "./amountInput";
import {
  copyBudget,
  createBudget,
  currencyFor,
  isCountry,
  isMonth,
  type Country,
} from "./budget";
import { monthName } from "./months";

export type StoredAmount = { category_id: string; amount_minor: number };

export type BudgetWrite = StoredAmount & { month: string; country: Country };

/** The parts of the database this needs, so tests can pass a fake. */
export type BudgetStore = {
  /** Null means the read failed, which is different from having no amounts. */
  amounts(month: string, country: Country): Promise<StoredAmount[] | null>;
  save(rows: BudgetWrite[]): Promise<"done" | "failed">;
  /** Adds rows and leaves any amount already stored untouched. */
  insertMissing(rows: BudgetWrite[]): Promise<"done" | "failed">;
};

const NOT_SAVED: ActionResult = {
  ok: false,
  message: "The budget wasn't saved. Try again.",
};
const BAD_AMOUNTS: ActionResult = {
  ok: false,
  message:
    "The budget wasn't saved. Correct the highlighted amounts and try again.",
};
const NOT_COPIED: ActionResult = {
  ok: false,
  message: "The amounts weren't copied. Try again.",
};

export type SaveBudgetInput = {
  month: string;
  country: string;
  /** What was typed, by category ID. */
  amounts: Readonly<Record<string, string>>;
};

/**
 * One bad amount refuses the whole save. A cleared amount stores 0 rather than
 * deleting the row, so saving a budget never removes anything.
 */
export async function saveBudget(
  store: BudgetStore,
  { month, country, amounts }: SaveBudgetInput,
): Promise<ActionResult> {
  if (!isMonth(month) || !isCountry(country)) return NOT_SAVED;

  const currency = currencyFor(country);
  const checks = Object.entries(amounts).map(
    ([categoryId, text]) => [categoryId, checkAmount(text, currency)] as const,
  );
  const typed = new Map<string, number | null>();
  for (const [categoryId, check] of checks) {
    if (!check.ok) return BAD_AMOUNTS;
    typed.set(categoryId, check.minor);
  }

  const stored = await store.amounts(month, country);
  if (stored === null) return NOT_SAVED;
  const saved = new Map(
    stored.map((row) => [row.category_id, row.amount_minor]),
  );

  const writes = [...typed].flatMap(([category_id, minor]) => {
    const amount_minor = minor ?? (saved.has(category_id) ? 0 : null);
    return amount_minor === null || amount_minor === saved.get(category_id)
      ? []
      : [{ month, country, category_id, amount_minor }];
  });

  if (writes.length > 0 && (await store.save(writes)) !== "done") {
    return NOT_SAVED;
  }
  return { ok: true, notice: "Budget saved." };
}

export type CopyMonthInput = { from: string; month: string; country: string };

/** Only inserts, so an amount already in the month is never overwritten. */
export async function copyMonth(
  store: BudgetStore,
  { from, month, country }: CopyMonthInput,
): Promise<ActionResult> {
  if (!isMonth(from) || !isMonth(month) || !isCountry(country)) {
    return NOT_COPIED;
  }

  const [source, target] = await Promise.all([
    store.amounts(from, country),
    store.amounts(month, country),
  ]);
  if (source === null || target === null) return NOT_COPIED;
  if (source.length === 0) {
    return { ok: false, message: `${monthName(from)} has no amounts to copy.` };
  }

  // Keyed by category ID here, because these rows are written straight back.
  const copied = copyBudget(
    createBudget(
      from,
      country,
      Object.fromEntries(
        source.map((row) => [row.category_id, row.amount_minor]),
      ),
    ),
    month,
  );

  const taken = new Set(target.map((row) => row.category_id));
  const rows = Object.entries(copied.amounts)
    .filter(([category_id]) => !taken.has(category_id))
    .map(([category_id, amount_minor]) => ({
      month,
      country,
      category_id,
      amount_minor,
    }));

  if (rows.length > 0 && (await store.insertMissing(rows)) !== "done") {
    return NOT_COPIED;
  }
  return { ok: true, notice: `Amounts copied from ${monthName(from)}.` };
}
