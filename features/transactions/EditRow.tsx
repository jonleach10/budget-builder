"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
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
import { glassField, NativeSelect } from "@/components/ui/native-select";
import { FieldError } from "@/components/ui/notice";
import { TYPE_OPTIONS } from "@/features/rules/rules";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import { editRowAction } from "./actions";
import { CheckField } from "./CheckField";
import {
  editFrom,
  pairWarning,
  rowForm,
  withFormType,
  type RowForm,
} from "./rowEditForm";
import { LABEL_LIMIT } from "./rowEdits";
import type {
  TransactionLine,
  TransactionsScreenData,
} from "./transactionsScreenData";

const LABEL = "text-caption text-moon-mist";

function BankFact({
  name,
  className,
  children,
}: {
  name: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-caption font-medium text-muted-foreground">{name}</dt>
      <dd className="mt-0.5 text-foreground [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function BankFacts({ line }: { line: TransactionLine }) {
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-frost-wash px-4 py-3 text-body-sm shadow-hairline">
      <BankFact name="Bank Text" className="col-span-2">
        <span className="font-eyebrow">{line.bankText ?? line.title}</span>
      </BankFact>
      <BankFact name="Amount">
        <span className="tabular-nums">{line.amount}</span>
        {line.original !== null && (
          <span className="text-caption text-muted-foreground tabular-nums">
            {` ${line.original}`}
          </span>
        )}
      </BankFact>
      <BankFact name="Date">{line.date}</BankFact>
      <BankFact name="Account">{line.account}</BankFact>
      <BankFact name="Purpose">{line.purpose ?? "-"}</BankFact>
      <BankFact name="Bank Type">{line.bankType ?? "-"}</BankFact>
      <BankFact name="Bank Category">{line.bankCategory ?? "-"}</BankFact>
    </dl>
  );
}

/** Always rendered, so a screen reader announces the warning when it appears. */
function PairWarning({ text }: { text: string | null }) {
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

export function EditRowFields({
  line,
  form,
  categories,
  fieldId,
  onChange,
}: {
  line: TransactionLine;
  form: RowForm;
  categories: TransactionsScreenData["categories"];
  fieldId: string;
  onChange: (form: RowForm) => void;
}) {
  return (
    <>
      <BankFacts line={line} />

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-label`} className={LABEL}>
          Label
        </Label>
        <Input
          id={`${fieldId}-label`}
          className={glassField}
          maxLength={LABEL_LIMIT}
          placeholder="Corner Market"
          autoComplete="off"
          value={form.label}
          aria-describedby={`${fieldId}-label-hint`}
          onChange={(event) => onChange({ ...form, label: event.target.value })}
        />
        <p
          id={`${fieldId}-label-hint`}
          className="text-caption text-muted-foreground">
          Shows first on this row. The bank text stays under it.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-type`} className={LABEL}>
            Type
          </Label>
          <NativeSelect
            id={`${fieldId}-type`}
            value={form.type}
            onChange={(event) =>
              onChange(
                withFormType(form, event.target.value as RowForm["type"]),
              )
            }>
            <option value="">No Type</option>
            {TYPE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-category`} className={LABEL}>
            Category
          </Label>
          <NativeSelect
            id={`${fieldId}-category`}
            value={form.categoryId}
            disabled={form.type !== "spending"}
            onChange={(event) =>
              onChange({ ...form, categoryId: event.target.value })
            }>
            <option value="">No Category</option>
            {categories.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <PairWarning text={pairWarning(line, form)} />

      <CheckField
        id={`${fieldId}-hidden`}
        label="Hide this row from totals"
        checked={form.hidden}
        onChange={(hidden) => onChange({ ...form, hidden })}
      />
    </>
  );
}

type EditRowProps = {
  line: TransactionLine;
  categories: TransactionsScreenData["categories"];
  onClose: () => void;
};

/**
 * The list behind only changes when the server sends new rows, so a failed save
 * leaves it showing what's stored.
 */
export function EditRowForm({ line, categories, onClose }: EditRowProps) {
  const [form, setForm] = useState(() => rowForm(line));
  const [saveError, setSaveError] = useState<string | null>(null);
  const { pending, run } = useServerAction();
  const fieldId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    run(
      () => editRowAction(line.id, editFrom(line, form)),
      (result) => {
        if (result.ok) onClose();
        else setSaveError(result.message);
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
        <DialogTitle>Edit Row</DialogTitle>
      </div>

      <EditRowFields
        line={line}
        form={form}
        categories={categories}
        fieldId={fieldId}
        onChange={setForm}
      />

      <FieldError message={saveError} />

      <DialogFooter className="max-md:flex-col-reverse">
        <OutlineButton className="max-md:w-full" onClick={onClose}>
          Cancel
        </OutlineButton>
        <Button
          type="submit"
          className="h-11 max-md:w-full md:h-9"
          disabled={pending}>
          {pending ? "Saving..." : "Save Row"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditRowDialog({
  line,
  categories,
  onClose,
}: Omit<EditRowProps, "line"> & { line: TransactionLine | null }) {
  return (
    <Dialog
      open={line !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[560px] max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none">
        {line !== null && (
          <EditRowForm
            key={line.id}
            line={line}
            categories={categories}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
