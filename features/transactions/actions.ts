"use server";

import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import type { ActionResult } from "@/lib/actionResult";
import { editRow, type RowEdit } from "./rowEdits";
import { rowEditStore } from "./rowEditStore";

export async function editRowAction(
  id: string,
  edit: RowEdit,
): Promise<ActionResult> {
  await requireSession();
  const result = await editRow(rowEditStore(await serverClient()), id, edit);
  revalidatePath("/transactions");
  revalidatePath("/review");
  // Budget, Overview and Accounts count these rows, and a failed save can still clear a pair.
  revalidatePath("/budget");
  revalidatePath("/");
  revalidatePath("/accounts");
  return result;
}
