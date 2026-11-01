"use client";

import { useState } from "react";
import { DangerButton, OutlineButton } from "@/components/ui/action-buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/notice";
import { useServerAction } from "@/hooks/use-server-action";
import { deleteRuleAction } from "./actions";

type DeleteRuleDialogProps = {
  /** The rule to delete. The dialog is closed when this is null. */
  ruleId: string | null;
  onClose: () => void;
};

export function DeleteRuleDialog({ ruleId, onClose }: DeleteRuleDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useServerAction();

  function close() {
    setError(null);
    onClose();
  }

  function handleDelete() {
    if (ruleId === null) return;
    setError(null);

    run(
      () => deleteRuleAction(ruleId),
      (result) => {
        if (result.ok) close();
        else setError(result.message);
      },
    );
  }

  return (
    <Dialog
      open={ruleId !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}>
      <DialogContent role="alertdialog">
        <DialogTitle>Delete Rule</DialogTitle>
        <DialogDescription>
          Future imports won&apos;t use this rule. Stored transactions don&apos;t
          change.
        </DialogDescription>
        <FieldError message={error} />
        <DialogFooter>
          <OutlineButton onClick={close}>Cancel</OutlineButton>
          <DangerButton disabled={pending} onClick={handleDelete}>
            {pending ? "Deleting..." : "Delete Rule"}
          </DangerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
