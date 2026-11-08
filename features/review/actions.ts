"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import { currentMonth } from "@/features/budget/months";
import type { RuleForm } from "@/features/rules/rules";
import { ruleStore } from "@/features/rules/ruleStore";
import {
  editRows,
  type RowEdit,
  type RowsResult,
} from "@/features/transactions/rowEdits";
import { rowEditStore } from "@/features/transactions/rowEditStore";
import type { ActionResult } from "@/lib/actionResult";
import { confirmTransfer } from "./confirmTransfer";
import { readReviewSource } from "./loadReviewInbox";
import { inboxRuleOffer, type InboxRuleOffer } from "./ruleFromCorrection";
import {
  saveRuleFromInbox,
  sortByRule,
  undoRuleSort,
  type RuleSortDeps,
  type SaveRuleResult,
  type SortNotice,
  type SortUndo,
} from "./ruleSort";
import { transferStore } from "./transferStore";

export type AcceptGroupResult =
  | RowsResult
  | (Extract<RowsResult, { ok: true }> & { offer: InboxRuleOffer });

/**
 * Gives a merchant group's rows one decision, through the shared write path.
 * When every row saved, it may offer a rule, worked out from what's now stored.
 */
export async function acceptGroupAction(
  ids: string[],
  edit: RowEdit,
): Promise<AcceptGroupResult> {
  await requireSession();
  const client = await serverClient();
  const result = await editRows(rowEditStore(client), ids, edit);
  const offer =
    result.ok && result.saved === result.total
      ? await offerAfterAccept(client, ids, edit)
      : null;
  // A failed batch can still have saved rows, so every screen refreshes.
  refreshScreens();
  return offer === null || !result.ok ? result : { ...result, offer };
}

/** A failed read only loses the offer, never the accept. */
async function offerAfterAccept(
  client: SupabaseClient,
  ids: string[],
  edit: RowEdit,
): Promise<InboxRuleOffer | null> {
  try {
    const [source, rules] = await Promise.all([
      readReviewSource(client, currentMonth(new Date())),
      ruleStore(client).list(),
    ]);
    return rules === null ? null : inboxRuleOffer(source, rules, ids, edit);
  } catch {
    return null;
  }
}

/** Marks the two rows the owner picked in a match as one transfer. */
export async function confirmTransferAction(
  ids: string[],
): Promise<ActionResult> {
  await requireSession();
  const result = await confirmTransfer(transferStore(await serverClient()), ids);
  // A transfer leaves Budget's totals, and a failure can leave a half pair.
  refreshScreens();
  return result;
}

async function sortDeps(): Promise<RuleSortDeps> {
  const client = await serverClient();
  return {
    rules: ruleStore(client),
    rows: rowEditStore(client),
    loadSource: async () => {
      try {
        return await readReviewSource(client, currentMonth(new Date()));
      } catch {
        return null;
      }
    },
  };
}

/** Adds a rule from the inbox, and sorts the rows in review it wins if asked. */
export async function addRuleFromInboxAction(
  form: RuleForm,
  sourceId: string,
  alsoSort: boolean,
): Promise<SaveRuleResult> {
  await requireSession();
  const result = await saveRuleFromInbox(await sortDeps(), form, sourceId, alsoSort);
  refreshScreens();
  return result;
}

/** Sort the Rest, or Sort N Rows with a rule that was already stored. */
export async function sortByRuleAction(
  ruleId: string,
  created: boolean,
): Promise<SortNotice> {
  await requireSession();
  const notice = await sortByRule(await sortDeps(), ruleId, created);
  refreshScreens();
  return notice;
}

/** Deletes the rule the inbox added and puts back the rows it sorted. */
export async function undoRuleSortAction(undo: SortUndo): Promise<SortNotice> {
  await requireSession();
  const notice = await undoRuleSort(await sortDeps(), undo);
  refreshScreens();
  return notice;
}

function refreshScreens(): void {
  revalidatePath("/review");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/rules");
  revalidatePath("/");
}
