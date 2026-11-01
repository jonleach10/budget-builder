"use server";

import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import type { ActionResult } from "@/lib/actionResult";
import {
  addRule,
  deleteRule,
  editRule,
  moveRule,
  type RuleStore,
} from "./ruleChanges";
import type { RuleForm } from "./rules";
import { ruleStore } from "./ruleStore";

async function changeRules(
  change: (store: RuleStore) => Promise<ActionResult>,
): Promise<ActionResult> {
  await requireSession();
  const result = await change(ruleStore(await serverClient()));
  revalidatePath("/rules");
  return result;
}

export async function addRuleAction(form: RuleForm): Promise<ActionResult> {
  return changeRules((store) => addRule(store, form));
}

export async function editRuleAction(
  id: string,
  form: RuleForm,
): Promise<ActionResult> {
  return changeRules((store) => editRule(store, id, form));
}

export async function deleteRuleAction(id: string): Promise<ActionResult> {
  return changeRules((store) => deleteRule(store, id));
}

export async function moveRuleAction(
  id: string,
  direction: string,
): Promise<ActionResult> {
  return changeRules((store) => moveRule(store, id, direction));
}
