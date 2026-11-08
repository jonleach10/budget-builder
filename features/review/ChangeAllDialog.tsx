"use client";

import { useId, useState, type FormEvent } from "react";
import { CircleAlert, X } from "lucide-react";
import { IconButton, OutlineButton } from "@/components/ui/action-buttons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { glassField } from "@/components/ui/native-select";
import { FieldError } from "@/components/ui/notice";
import { LABEL_LIMIT } from "@/features/transactions/rowEdits";
import { useServerAction } from "@/hooks/use-server-action";
import { labelGroupAction } from "./actions";
import { checkGroupLabel, groupLabelStart } from "./groupLabel";
import type { MerchantGroup } from "./reviewInbox";

/** Always rendered, so a screen reader announces the warning when it appears. */
function Warning({ text }: { text: string | null }) {
  return (
    <div role="status" className="empty:absolute">
      {text !== null && (
        <p className="flex items-start gap-2.5 rounded-xl bg-frost-wash px-4 py-3 text-body-sm text-moon-mist shadow-hairline">
          <CircleAlert
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span>{text}</span>
        </p>
      )}
    </div>
  );
}

type ChangeAllProps = {
  group: MerchantGroup;
  onClose: () => void;
  /** Called with the notice once the label is saved, before the dialog closes. */
  onSaved: (notice: string) => void;
};

/**
 * Change All's form: one label for every row of the group, as Edit Row's
 * Label field. The rows are the ones the inbox loaded, as Accept sends.
 */
function ChangeAllForm({ group, onClose, onSaved }: ChangeAllProps) {
  const [label, setLabel] = useState(() => groupLabelStart(group.rows));
  const [saveError, setSaveError] = useState<string | null>(null);
  const { pending, run } = useServerAction();
  const fieldId = useId();
  const check = checkGroupLabel(group.rows, label);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!check.canSave) return;
    setSaveError(null);

    run(
      () => labelGroupAction(group.rows.map(({ id }) => id), label),
      (result) => {
        if (!result.ok) {
          setSaveError(result.message);
          return;
        }
        onSaved(result.notice);
        onClose();
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton
          label="Close"
          icon={X}
          className="-ml-2 md:hidden"
          onClick={onClose}
        />
        <DialogTitle>Label All Rows</DialogTitle>
      </div>

      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl bg-frost-wash px-4 py-3 text-body-sm shadow-hairline">
        <div className="min-w-0">
          <dt className="text-caption font-medium text-muted-foreground">Bank Text</dt>
          <dd className="mt-0.5 font-eyebrow text-foreground [overflow-wrap:anywhere]">
            {group.name}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-caption font-medium text-muted-foreground">Rows</dt>
          <dd className="mt-0.5 text-foreground tabular-nums">
            {group.count.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-label`} className="text-caption text-moon-mist">
          Label
        </Label>
        <Input
          id={`${fieldId}-label`}
          className={glassField}
          maxLength={LABEL_LIMIT}
          placeholder="Corner Market"
          autoComplete="off"
          value={label}
          aria-describedby={`${fieldId}-label-hint`}
          onChange={(event) => setLabel(event.target.value)}
        />
        <p id={`${fieldId}-label-hint`} className="text-caption text-muted-foreground">
          Shows first on every row in this group. Type and category stay as they
          are, and the rows stay in review.
        </p>
      </div>

      <Warning text={check.warning} />

      <FieldError message={saveError} />

      <DialogFooter className="max-md:flex-col-reverse">
        <OutlineButton className="max-md:w-full" onClick={onClose}>
          Cancel
        </OutlineButton>
        <Button
          type="submit"
          className="h-11 max-md:w-full md:h-9"
          disabled={pending || !check.canSave}>
          {pending ? "Saving..." : check.saveText}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Opens for one group at a time, and looks like Edit Row. */
export function ChangeAllDialog({
  group,
  onClose,
  onSaved,
}: Omit<ChangeAllProps, "group"> & { group: MerchantGroup | null }) {
  return (
    <Dialog
      open={group !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[560px] max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none">
        {group !== null && (
          <ChangeAllForm
            key={group.key}
            group={group}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
