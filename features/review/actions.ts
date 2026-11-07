"use server";

import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import { editRows, type RowEdit } from "@/features/transactions/rowEdits";
import { rowEditStore } from "@/features/transactions/rowEditStore";
import type { ActionResult } from "@/lib/actionResult";
import { confirmTransfer } from "./confirmTransfer";
import { transferStore } from "./transferStore";

/** Gives a merchant group's rows one decision, through the shared write path. */
export async function acceptGroupAction(
  ids: string[],
  edit: RowEdit,
): Promise<ActionResult> {
  await requireSession();
  const result = await editRows(rowEditStore(await serverClient()), ids, edit);
  // A failed batch can still have saved rows, so every screen refreshes.
  refreshScreens();
  return result;
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

function refreshScreens(): void {
  revalidatePath("/review");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  revalidatePath("/");
}
