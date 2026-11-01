"use server";

import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import type { ActionResult } from "@/lib/actionResult";
import { copyMonth, saveBudget, type BudgetStore } from "./budgetChanges";
import { budgetStore } from "./budgetStore";

async function changeBudget(
  change: (store: BudgetStore) => Promise<ActionResult>,
): Promise<ActionResult> {
  await requireSession();
  const result = await change(budgetStore(await serverClient()));
  revalidatePath("/budget");
  // The Overview screen shows the same budget.
  revalidatePath("/");
  return result;
}

export async function saveBudgetAction(
  month: string,
  country: string,
  amounts: Readonly<Record<string, string>>,
): Promise<ActionResult> {
  return changeBudget((store) => saveBudget(store, { month, country, amounts }));
}

/** Copying only inserts, so it never overwrites an amount in the month. */
export async function copyMonthAction(
  from: string,
  month: string,
  country: string,
): Promise<ActionResult> {
  return changeBudget((store) => copyMonth(store, { from, month, country }));
}
