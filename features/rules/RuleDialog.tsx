"use client";

import { useId, useState, type FormEvent } from "react";
import { OutlineButton } from "@/components/ui/action-buttons";
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
import { useServerAction } from "@/hooks/use-server-action";
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

type RuleEditorProps = {
  /** The rule being edited, or null when adding one. */
  rule: RuleItem | null;
  categories: readonly { id: string; name: string }[];
  onClose: () => void;
};

function RuleEditor({ rule, categories, onClose }: RuleEditorProps) {
  const [form, setForm] = useState<RuleForm>(rule?.form ?? EMPTY_RULE_FORM);
  const [valueError, setValueError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { pending, run } = useServerAction();
  const ids = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    const check = validateRule(ruleFromForm(form));
    setValueError(check.ok ? null : check.message);
    if (!check.ok) return;

    run(
      () =>
        rule === null ? addRuleAction(form) : editRuleAction(rule.id, form),
      (result) => {
        if (result.ok) onClose();
        else setSaveError(result.message);
      },
    );
  }

  function handleTypeChange(type: string) {
    setForm({
      ...form,
      type,
      categoryId: type === "spending" ? form.categoryId : "",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogTitle>{rule === null ? "Add Rule" : "Edit Rule"}</DialogTitle>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-match`} className={LABEL}>
          Match
        </Label>
        <NativeSelect
          id={`${ids}-match`}
          value={form.matchOn}
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
          className={glassField}
          placeholder="CORNER MARKET"
          autoComplete="off"
          value={form.value}
          aria-invalid={valueError !== null}
          aria-describedby={`${ids}-value-error`}
          onChange={(event) => setForm({ ...form, value: event.target.value })}
        />
        <FieldError id={`${ids}-value-error`} message={valueError} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-type`} className={LABEL}>
            Type
          </Label>
          <NativeSelect
            id={`${ids}-type`}
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
            <Label htmlFor={`${ids}-category`} className={LABEL}>
              Category
            </Label>
            <NativeSelect
              id={`${ids}-category`}
              value={form.categoryId}
              onChange={(event) =>
                setForm({ ...form, categoryId: event.target.value })
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

      <FieldError message={saveError} />

      <DialogFooter>
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <Button type="submit" className="h-11 md:h-9" disabled={pending}>
          {pending ? "Saving..." : "Save Rule"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type RuleDialogProps = Omit<RuleEditorProps, "rule"> & {
  /** Nothing to show when null. A rule edits it, and "new" adds one. */
  target: RuleItem | "new" | null;
};

export function RuleDialog({ target, categories, onClose }: RuleDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <DialogContent aria-describedby={undefined}>
        {target !== null && (
          <RuleEditor
            rule={target === "new" ? null : target}
            categories={categories}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
