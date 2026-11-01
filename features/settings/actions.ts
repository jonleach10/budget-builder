"use server";

import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import type { ActionResult } from "@/lib/actionResult";
import {
  addCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
  type CategoryStore,
} from "./categoryChanges";
import { categoryStore } from "./categoryStore";

async function changeCategories(
  change: (store: CategoryStore) => Promise<ActionResult>,
): Promise<ActionResult> {
  await requireSession();
  const result = await change(categoryStore(await serverClient()));
  revalidatePath("/settings");
  // The Rules screen shows category names and lists them in the rule form.
  revalidatePath("/rules");
  return result;
}

export async function addCategoryAction(name: string): Promise<ActionResult> {
  return changeCategories((store) => addCategory(store, name));
}

export async function renameCategoryAction(
  id: string,
  name: string,
): Promise<ActionResult> {
  return changeCategories((store) => renameCategory(store, id, name));
}

export async function moveCategoryAction(
  id: string,
  direction: string,
): Promise<ActionResult> {
  return changeCategories((store) => moveCategory(store, id, direction));
}

/** Runs the in-use check again here, on counts read at the moment of deleting. */
export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return changeCategories((store) => deleteCategory(store, id));
}
