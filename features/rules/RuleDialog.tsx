"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { OutlineButton } from "@/components/ui/action-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { glassField, NativeSelect } from "@/components/ui/native-select";
import { FieldError } from "@/components/ui/notice";
import {
  addRuleFromInboxAction,
  sortByRuleAction,
} from "@/features/review/actions";
import { ruleDialogView, valueHint } from "@/features/review/ruleDialogView";
import type { InboxRuleOffer } from "@/features/review/ruleFromCorrection";
import { RuleSortBox } from "@/features/review/RuleSortBox";
import type { SortNotice } from "@/features/review/ruleSort";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import { addRuleAction, editRuleAction } from "./actions";
import {
  EMPTY_RULE_FORM,
  MATCH_OPTIONS,
  ruleFromForm,
  TYPE_OPTIONS,
  validateRule,
  type RuleForm,
  type RuleItem,
} from "./rules";

const LABEL = "text-caption text-moon-mist";

/** A rule offered in the Review inbox: filled in, with an outcome fixed by the accept. */
export type InboxRule = {
  offer: InboxRuleOffer;
  onSaved: (notice: SortNotice) => void;
  onEditEarlier: (ruleId: string) => void;
};

type Categories = readonly { id: string; name: string }[];

type RuleEditorProps = {
  /** The rule being edited, or null when adding one. */
  rule: RuleItem | null;
  categories: Categories;
  onClose: () => void;
  /** Adds the inbox's offered rule: Gives is read-only, and rows can be sorted. */
  inbox?: InboxRule;
};

function OutcomeFields({
  form,
  categories,
  fieldId,
  onChange,
}: {
  form: RuleForm;
  categories: Categories;
  fieldId: string;
  onChange: (form: RuleForm) => void;
}) {
  function handleTypeChange(type: string) {
    onChange({
      ...form,
      type,
      categoryId: type === "spending" ? form.categoryId : "",
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-type`} className={LABEL}>
          Type
        </Label>
        <NativeSelect
          id={`${fieldId}-type`}
          value={form.type}
          onChange={(event) => handleTypeChange(event.target.value)}>
          {TYPE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {form.type === "spending" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-category`} className={LABEL}>
            Category
          </Label>
          <NativeSelect
            id={`${fieldId}-category`}
            value={form.categoryId}
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
      )}
    </div>
  );
}

/** What the inbox's rule gives, which the accept already decided. */
function Gives({ offer }: { offer: InboxRuleOffer }) {
  return (
    <div className="space-y-1.5">
      <span className={cn("block", LABEL)}>Gives</span>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        <Badge quiet>{offer.gives.typeLabel}</Badge>
        {offer.gives.category !== null && <Badge>{offer.gives.category}</Badge>}
      </div>
    </div>
  );
}

function RuleEditor({ rule, categories, onClose, inbox }: RuleEditorProps) {
  const [form, setForm] = useState<RuleForm>(
    inbox?.offer.form ?? rule?.form ?? EMPTY_RULE_FORM,
  );
  const [alsoSort, setAlsoSort] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { pending, run } = useServerAction();
  const ids = useId();
  const view = useMemo(
    () => (inbox === undefined ? null : ruleDialogView(inbox.offer, form, categories)),
    [inbox, form, categories],
  );

  function saveFromInbox(offered: InboxRule) {
    if (view?.kind === "exists" && view.sortLabel !== null) {
      const ruleId = view.ruleId;
      run(
        async () => ({ ok: true as const, sorted: await sortByRuleAction(ruleId, false) }),
        (result) => {
          if (result.ok) offered.onSaved(result.sorted);
          else setSaveError(result.message);
        },
      );
      return;
    }
    if (view?.kind !== "new") return;
    const sorts = alsoSort && view.sort !== null;
    run(
      () => addRuleFromInboxAction(form, offered.offer.sourceId, sorts),
      (result) => {
        if (result.ok) offered.onSaved(result.outcome);
        else setSaveError(result.message);
      },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    const check = validateRule(ruleFromForm(form));
    setValueError(check.ok ? null : check.message);
    if (!check.ok) return;

    if (inbox !== undefined) {
      saveFromInbox(inbox);
      return;
    }
    run(
      () =>
        rule === null ? addRuleAction(form) : editRuleAction(rule.id, form),
      (result) => {
        if (result.ok) onClose();
        else setSaveError(result.message);
      },
    );
  }

  const blocked =
    view?.kind === "earlier" || (view?.kind === "exists" && view.sortLabel === null);
  const submitLabel = view?.kind === "exists" && view.sortLabel !== null
    ? view.sortLabel
    : "Save Rule";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-busy={pending}>
      <div className="space-y-1">
        <DialogTitle>{rule === null ? "Add Rule" : "Edit Rule"}</DialogTitle>
        {inbox !== undefined && (
          <DialogDescription className="text-caption text-muted-foreground">
            Applies to future imports. Rows already sorted don&apos;t change.
          </DialogDescription>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-match`} className={LABEL}>
          Match
        </Label>
        <NativeSelect
          id={`${ids}-match`}
          value={form.matchOn}
          disabled={pending}
          onChange={(event) =>
            setForm({ ...form, matchOn: event.target.value })
          }>
          {MATCH_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-value`} className={LABEL}>
          Value
        </Label>
        <Input
          id={`${ids}-value`}
          className={cn(glassField, inbox !== undefined && "font-eyebrow")}
          placeholder="CORNER MARKET"
          autoComplete="off"
          value={form.value}
          disabled={pending}
          aria-invalid={valueError !== null}
          aria-describedby={`${ids}-value-error${inbox === undefined ? "" : ` ${ids}-value-hint`}`}
          onChange={(event) => setForm({ ...form, value: event.target.value })}
        />
        {inbox !== undefined && (
          <p id={`${ids}-value-hint`} className="text-caption text-muted-foreground">
            {valueHint(form.matchOn, inbox.offer.codeInText)}
          </p>
        )}
        <FieldError id={`${ids}-value-error`} message={valueError} />
      </div>

      {inbox === undefined ? (
        <OutcomeFields
          form={form}
          categories={categories}
          fieldId={ids}
          onChange={setForm}
        />
      ) : (
        <Gives offer={inbox.offer} />
      )}

      {view !== null && (
        <RuleSortBox
          view={view}
          alsoSort={alsoSort}
          disabled={pending}
          onAlsoSort={setAlsoSort}
        />
      )}

      <FieldError message={saveError} />

      <DialogFooter className="flex-wrap [&>*]:flex-1 md:[&>*]:flex-none">
        <OutlineButton disabled={pending} onClick={onClose}>
          Cancel
        </OutlineButton>
        {view?.kind === "earlier" && inbox !== undefined && (
          <OutlineButton onClick={() => inbox.onEditEarlier(view.ruleId)}>
            Edit Earlier Rule
          </OutlineButton>
        )}
        <Button type="submit" className="h-11 md:h-9" disabled={pending || blocked}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

type RuleDialogProps = Omit<RuleEditorProps, "rule"> & {
  /** Nothing to show when null. A rule edits it, and "new" adds one. */
  target: RuleItem | "new" | null;
};

export function RuleDialog({ target, categories, onClose, inbox }: RuleDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <DialogContent
        // Only the inbox's dialog has a description for Radix to link.
        {...(inbox === undefined ? { "aria-describedby": undefined } : {})}
        className={cn(inbox !== undefined && "max-w-[560px] p-5 md:p-6")}>
        {target !== null && (
          <RuleEditor
            rule={target === "new" ? null : target}
            categories={categories}
            onClose={onClose}
            inbox={inbox}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
