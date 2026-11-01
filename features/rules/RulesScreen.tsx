"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { IconButton, OutlineButton } from "@/components/ui/action-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, type NoticeMessage } from "@/components/ui/notice";
import { useServerAction } from "@/hooks/use-server-action";
import type { Direction } from "@/lib/ordering";
import { moveRuleAction } from "./actions";
import { DeleteRuleDialog } from "./DeleteRuleDialog";
import { RuleDialog } from "./RuleDialog";
import type { RuleItem, RulesScreenData } from "./rules";

const SUBTITLE =
  "Rules apply to future imports. Stored transactions don't change.";

type RuleActions = {
  busy: boolean;
  move: (rule: RuleItem, direction: Direction) => void;
  edit: (rule: RuleItem) => void;
  remove: (rule: RuleItem) => void;
};

type RowProps = {
  rule: RuleItem;
  isFirst: boolean;
  isLast: boolean;
  actions: RuleActions;
};

function Gives({ rule }: { rule: RuleItem }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge quiet>{rule.typeLabel}</Badge>
      {rule.category !== null && <Badge>{rule.category}</Badge>}
    </div>
  );
}

function MoveButtons({ rule, isFirst, isLast, actions }: RowProps) {
  return (
    <>
      <IconButton
        label={`Move ${rule.value} up`}
        icon={ArrowUp}
        disabled={isFirst || actions.busy}
        onClick={() => actions.move(rule, "up")}
      />
      <IconButton
        label={`Move ${rule.value} down`}
        icon={ArrowDown}
        disabled={isLast || actions.busy}
        onClick={() => actions.move(rule, "down")}
      />
    </>
  );
}

function EditAndDelete({ rule, actions }: Pick<RowProps, "rule" | "actions">) {
  return (
    <>
      <OutlineButton onClick={() => actions.edit(rule)}>Edit</OutlineButton>
      <IconButton
        label={`Delete ${rule.value}`}
        icon={Trash2}
        onClick={() => actions.remove(rule)}
      />
    </>
  );
}

function RuleTable({
  caption,
  rules,
  actions,
}: {
  caption: string;
  rules: readonly RuleItem[];
  actions: RuleActions;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[640px] table-fixed text-body-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-background text-left text-caption text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="w-[172px] py-2.5 pr-4 pl-6 font-medium">
              Match
            </th>
            <th scope="col" className="px-2 py-2.5 font-medium">
              Value
            </th>
            <th scope="col" className="px-2 py-2.5 font-medium">
              Gives
            </th>
            <th
              scope="col"
              className="w-[208px] py-2.5 pr-6 pl-2 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <tr key={rule.id} className="border-b border-border last:border-b-0">
              <td className="py-1.5 pr-4 pl-6">{rule.matchLabel}</td>
              <td className="px-2 py-1.5 font-eyebrow [overflow-wrap:anywhere]">
                {rule.value}
              </td>
              <td className="px-2 py-1.5">
                <Gives rule={rule} />
              </td>
              <td className="py-1.5 pr-6 pl-2">
                <div className="flex items-center justify-end gap-0.5">
                  <MoveButtons
                    rule={rule}
                    isFirst={index === 0}
                    isLast={index === rules.length - 1}
                    actions={actions}
                  />
                  <EditAndDelete rule={rule} actions={actions} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RuleCards({
  rules,
  actions,
}: {
  rules: readonly RuleItem[];
  actions: RuleActions;
}) {
  return (
    <Card className="overflow-hidden md:hidden">
      <ul className="divide-y divide-border">
        {rules.map((rule, index) => (
          <li key={rule.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption text-muted-foreground">
                {rule.matchLabel}
              </span>
              <div className="flex gap-0.5">
                <MoveButtons
                  rule={rule}
                  isFirst={index === 0}
                  isLast={index === rules.length - 1}
                  actions={actions}
                />
              </div>
            </div>
            <span className="font-eyebrow text-body-sm [overflow-wrap:anywhere]">
              {rule.value}
            </span>
            <div className="flex items-center justify-between gap-3">
              <Gives rule={rule} />
              <div className="flex items-center gap-0.5">
                <EditAndDelete rule={rule} actions={actions} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RuleGroup({
  title,
  hint,
  emptyText,
  rules,
  actions,
}: {
  title: string;
  hint: string;
  emptyText: string;
  rules: readonly RuleItem[];
  actions: RuleActions;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-2xl md:bg-card md:shadow-glass">
      <div className="space-y-0.5 md:px-6 md:py-5">
        <h2 className="text-body font-medium text-ice-highlight">{title}</h2>
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>
      {rules.length === 0 ? (
        <p className="text-body-sm text-muted-foreground md:px-6 md:pb-5">
          {emptyText}
        </p>
      ) : (
        <>
          <RuleTable caption={title} rules={rules} actions={actions} />
          <RuleCards rules={rules} actions={actions} />
        </>
      )}
    </section>
  );
}

function NoRules({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="relative flex flex-col items-center overflow-hidden px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(var(--color-frost-wash)_1px,transparent_1px),linear-gradient(90deg,var(--color-frost-wash)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_center,black_20%,transparent_75%)] bg-size-[80px_80px]"
      />
      <div className="relative flex max-w-[420px] flex-col items-center gap-3">
        <h2 className="text-body font-medium text-ice-highlight">
          No Rules Yet
        </h2>
        <p className="text-body-sm text-moon-mist">
          Add a rule here, or create one by correcting a row in the review inbox.
        </p>
        <Button type="button" className="h-11 md:h-9" onClick={onAdd}>
          Add Rule
        </Button>
      </div>
    </Card>
  );
}

export function RulesScreen({ data }: { data: RulesScreenData | null }) {
  const [editing, setEditing] = useState<RuleItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const { pending, run } = useServerAction();

  if (data === null) {
    return (
      <PageFrame title="Rules" subtitle={SUBTITLE}>
        <Notice
          message={{
            tone: "error",
            text: "The rules can't be loaded. Reload the page to try again.",
          }}
        />
      </PageFrame>
    );
  }

  const { idRules, textRules, categories } = data;
  const hasRules = idRules.length + textRules.length > 0;

  const actions: RuleActions = {
    busy: pending,
    edit: setEditing,
    remove: (rule) => setDeleting(rule.id),
    move(rule, direction) {
      setNotice(null);
      run(
        () => moveRuleAction(rule.id, direction),
        (result) => {
          if (!result.ok) setNotice({ tone: "error", text: result.message });
        },
      );
    },
  };

  return (
    <PageFrame
      title="Rules"
      subtitle={SUBTITLE}
      action={
        hasRules && (
          <Button
            type="button"
            className="h-11 w-full md:h-9 md:w-auto"
            onClick={() => setEditing("new")}>
            Add Rule
          </Button>
        )
      }>
      <Notice message={notice} />

      {hasRules ? (
        <>
          <RuleGroup
            title="ID Rules"
            hint="Tried first. An ID must match exactly."
            emptyText="No ID rules yet."
            rules={idRules}
            actions={actions}
          />
          <RuleGroup
            title="Text Rules"
            hint="Tried after ID rules, top to bottom. The first match wins, and case doesn't matter."
            emptyText="No text rules yet."
            rules={textRules}
            actions={actions}
          />
        </>
      ) : (
        <NoRules onAdd={() => setEditing("new")} />
      )}

      <RuleDialog
        target={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
      <DeleteRuleDialog
        ruleId={deleting}
        onClose={() => setDeleting(null)}
      />
    </PageFrame>
  );
}
