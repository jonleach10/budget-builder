"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { glassField } from "@/components/ui/native-select";
import { FieldError } from "@/components/ui/notice";
import { editRowAction } from "@/features/transactions/actions";
import { LABEL_LIMIT } from "@/features/transactions/rowEdits";
import { useServerAction } from "@/hooks/use-server-action";
import { DecisionFields, SuggestionLine } from "./MerchantGroups";
import {
  noMerchantEdit,
  noMerchantForm,
  showsUse,
  type NoMerchantForm,
} from "./reviewForm";
import type { NoMerchantRow, ReviewInbox } from "./reviewInbox";

const GHOST_PILL =
  "h-11 bg-frost-wash text-white shadow-hairline hover:bg-accent md:h-9";

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium text-muted-foreground">{name}</dt>
      <dd className="mt-0.5 text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function NoMerchantCard({
  row,
  categories,
}: {
  row: NoMerchantRow;
  categories: ReviewInbox["categories"];
}) {
  const { line, suggestion, redacted } = row;
  const [form, setForm] = useState<NoMerchantForm>(() => noMerchantForm(line));
  const [saveError, setSaveError] = useState<string | null>(null);
  const { pending, run } = useServerAction();
  const fieldId = useId();
  const edit = noMerchantEdit(line, form);
  const bankText = line.bankText ?? line.title;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (edit === null) return;
    setSaveError(null);
    run(
      () => editRowAction(line.id, edit),
      (result) => {
        if (!result.ok) setSaveError(result.message);
      },
    );
  }

  return (
    <section
      aria-label={`Row from ${line.date}`}
      className="flex flex-col gap-4 rounded-2xl bg-card p-4 text-body-sm shadow-glass md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="min-w-0 font-eyebrow text-foreground [overflow-wrap:anywhere]">
          {bankText === "" ? "No description" : bankText}
        </span>
        <span className="font-medium text-moon-mist tabular-nums">
          {line.amount}
          {line.original !== null && (
            <span className="ml-2 text-caption text-muted-foreground">
              {line.original}
            </span>
          )}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Fact name="Date">{line.date}</Fact>
        <Fact name="Account">{line.account}</Fact>
        <Fact name="Bank Type">{line.bankType ?? "-"}</Fact>
        <Fact name="Bank Category">{line.bankCategory ?? "-"}</Fact>
        <Fact name="Purpose">{line.purpose ?? "-"}</Fact>
      </dl>

      {redacted && (
        <p className="text-caption text-muted-foreground">
          A number was removed from this text at import, so it can&apos;t be
          shown. Your bank statement has it.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <SuggestionLine
          suggestion={suggestion}
          shown={showsUse(form, suggestion)}
          onUse={() =>
            suggestion !== null &&
            setForm({ ...form, type: "spending", categoryId: suggestion.categoryId })
          }
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_148px_200px_auto] md:items-end">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${fieldId}-label`} className="text-caption text-moon-mist">
              Label
            </Label>
            <Input
              id={`${fieldId}-label`}
              className={glassField}
              maxLength={LABEL_LIMIT}
              placeholder="Corner Market"
              autoComplete="off"
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
            />
          </div>
          <DecisionFields
            decision={form}
            categories={categories}
            fieldId={fieldId}
            onChange={(decision) => setForm({ ...form, ...decision })}
          />
          <Button
            type="submit"
            variant="ghost"
            className={`${GHOST_PILL} w-full md:w-auto`}
            disabled={edit === null || pending}>
            {pending ? "Saving..." : "Save Row"}
          </Button>
        </div>
        <FieldError message={saveError} />
      </form>
    </section>
  );
}

/** One card per row, with no accept-all, because these rows may be different payees. */
export function NoMerchantRows({
  rows,
  categories,
}: {
  rows: readonly NoMerchantRow[];
  categories: ReviewInbox["categories"];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl bg-card px-6 py-12 text-center text-body-sm text-moon-mist shadow-glass">
        No rows here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted-foreground">
        These rows have no merchant to group by, so each one takes its own
        decision.
      </p>
      {rows.map((row) => (
        <NoMerchantCard key={row.line.id} row={row} categories={categories} />
      ))}
    </div>
  );
}
