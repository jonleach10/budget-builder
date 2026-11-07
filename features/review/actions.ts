"use server";

import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import { editRows, type RowEdit } from "@/features/transactions/rowEdits";
import { rowEditStore } from "@/features/transactions/rowEditStore";
import type { ActionResult } from "@/lib/actionResult";

/** Gives a merchant group's rows one decision, through the shared write path. */
export async function acceptGroupAction(
  ids: string[],
  edit: RowEdit,
): Promise<ActionResult> {
  await requireSession();
  const result = await editRows(rowEditStore(await serverClient()), ids, edit);
  // A failed batch can still have saved rows, so every screen refreshes.
  revalidatePath("/review");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/");
  return result;
}
