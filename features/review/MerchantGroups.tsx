"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { OutlineButton } from "@/components/ui/action-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Notice, type NoticeMessage } from "@/components/ui/notice";
import { AmountWithOriginal } from "@/features/budget/ScreenParts";
import type { TransactionType } from "@/features/categorize/transactionType";
import { RuleDialog } from "@/features/rules/RuleDialog";
import { TYPE_OPTIONS, type RuleItem } from "@/features/rules/rules";
import { EditRowDialog } from "@/features/transactions/EditRow";
import type { RowEdit } from "@/features/transactions/rowEdits";
import type { TransactionLine } from "@/features/transactions/transactionsScreenData";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import {
  acceptGroupAction,
  sortByRuleAction,
  undoRuleSortAction,
} from "./actions";
import { offerText, storedRuleItem } from "./ruleDialogView";
import type { InboxRuleOffer } from "./ruleFromCorrection";
import { mergeUndo, type SortNotice, type SortUndo } from "./ruleSort";
import {
  acceptLabel,
  decisionEdit,
  showsUse,
  START_DECISION,
  withDecisionType,
  type Decision,
} from "./reviewForm";
import type { MerchantGroup, ReviewInbox, Suggestion } from "./reviewInbox";

const FIELD_LABEL = "text-caption text-moon-mist";

type Categories = ReviewInbox["categories"];
type ChangeRow = (line: TransactionLine) => void;

export function SuggestionLine({
  suggestion,
  shown,
  onUse,
  className,
}: {
  suggestion: Suggestion | null;
  shown: boolean;
  onUse: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 text-body-sm text-moon-mist empty:hidden",
        className,
      )}>
      {shown && suggestion !== null && (
        <>
          <span>{`Suggested: ${suggestion.name}`}</span>
          <button
            type="button"
            onClick={onUse}
            className="min-h-11 rounded-md px-1 font-medium text-foreground underline underline-offset-2 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring md:min-h-6">
            Use
          </button>
        </>
      )}
    </div>
  );
}

export function DecisionFields({
  decision,
  categories,
  fieldId,
  onChange,
}: {
  decision: Decision;
  categories: Categories;
  fieldId: string;
  onChange: (decision: Decision) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:contents">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${fieldId}-type`} className={FIELD_LABEL}>
          Type
        </Label>
        <NativeSelect
          id={`${fieldId}-type`}
          value={decision.type}
          onChange={(event) =>
            onChange(
              withDecisionType(decision, event.target.value as TransactionType),
            )
          }>
          {TYPE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${fieldId}-category`} className={FIELD_LABEL}>
          Category
        </Label>
        <NativeSelect
          id={`${fieldId}-category`}
          value={decision.categoryId}
          disabled={decision.type !== "spending"}
          onChange={(event) =>
            onChange({ ...decision, categoryId: event.target.value })
          }>
          <option value="">Select a category</option>
          {categories.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

function changeLabel(line: TransactionLine): string {
  return `Change ${line.title} from ${line.date}`;
}

function ChangeButton({
  line,
  onChange,
}: {
  line: TransactionLine;
  onChange: ChangeRow;
}) {
  return (
    <OutlineButton
      aria-label={changeLabel(line)}
      className="md:h-8 md:px-3"
      onClick={() => onChange(line)}>
      Change
    </OutlineButton>
  );
}

function Title({ line }: { line: TransactionLine }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div>{line.title}</div>
      {line.bankText !== null && (
        <div className="text-caption text-muted-foreground">{line.bankText}</div>
      )}
    </div>
  );
}

function Muted({ text }: { text: string | null }) {
  return text === null ? (
    <span className="text-muted-foreground">-</span>
  ) : (
    <>{text}</>
  );
}

const HEAD = "py-2 px-2 text-left font-medium";

function GroupTable({
  rows,
  onChange,
}: {
  rows: readonly TransactionLine[];
  onChange: ChangeRow;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-xl bg-background shadow-hairline md:block">
      <table className="w-full min-w-[880px] table-fixed text-body-sm">
        <caption className="sr-only">Rows in this group, newest first</caption>
        <thead className="text-caption text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className={cn(HEAD, "w-[72px] pl-4")}>Date</th>
            <th scope="col" className={HEAD}>Description</th>
            <th scope="col" className={cn(HEAD, "w-[18%]")}>Purpose</th>
            <th scope="col" className={cn(HEAD, "w-28")}>Account</th>
            <th scope="col" className={cn(HEAD, "w-24")}>Bank Type</th>
            <th scope="col" className={cn(HEAD, "w-28")}>Bank Category</th>
            <th scope="col" className={cn(HEAD, "w-28 text-right")}>Amount</th>
            <th scope="col" className={cn(HEAD, "w-[96px] pr-4 text-right")}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.id} className="border-b border-border align-top last:border-b-0">
              <td className="py-2.5 pr-2 pl-4 text-muted-foreground">{line.date}</td>
              <td className="px-2 py-2.5">
                <Title line={line} />
              </td>
              <td className="px-2 py-2.5 text-moon-mist [overflow-wrap:anywhere]">
                <Muted text={line.purpose} />
              </td>
              <td className="px-2 py-2.5 text-moon-mist [overflow-wrap:anywhere]">
                {line.account}
              </td>
              <td className="px-2 py-2.5 font-eyebrow text-caption text-moon-mist [overflow-wrap:anywhere]">
                <Muted text={line.bankType} />
              </td>
              <td className="px-2 py-2.5 text-moon-mist [overflow-wrap:anywhere]">
                <Muted text={line.bankCategory} />
              </td>
              <td className="px-2 py-2.5 text-right">
                <AmountWithOriginal line={line} />
              </td>
              <td className="py-1.5 pr-4 pl-2 text-right">
                <ChangeButton line={line} onChange={onChange} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function bankDetails(line: TransactionLine): string {
  return [line.purpose, line.bankType, line.bankCategory]
    .filter((part) => part !== null && part !== "")
    .join(" · ");
}

function GroupList({
  rows,
  onChange,
}: {
  rows: readonly TransactionLine[];
  onChange: ChangeRow;
}) {
  return (
    <ul aria-label="Rows in this group" className="divide-y divide-border text-body-sm md:hidden">
      {rows.map((line) => (
        <li key={line.id} className="flex flex-col gap-1.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <Title line={line} />
            <div className="shrink-0 text-right">
              <AmountWithOriginal line={line} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-caption text-muted-foreground [overflow-wrap:anywhere]">
              <div>{`${line.date} · ${line.account}`}</div>
              {bankDetails(line) !== "" && <div>{bankDetails(line)}</div>}
            </div>
            <ChangeButton line={line} onChange={onChange} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function GroupButton({
  group,
  open,
  panelId,
  onToggle,
}: {
  group: MerchantGroup;
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
      className="grid min-h-16 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-left outline-none hover:bg-frost-wash focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:min-h-14 md:grid-cols-[20px_minmax(0,1fr)_80px_112px_176px] md:px-6">
      <ChevronRight
        className={cn(
          "size-4 text-moon-mist transition-transform motion-reduce:transition-none",
          open && "rotate-90",
        )}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block font-eyebrow text-body-sm text-foreground [overflow-wrap:anywhere]">
          {group.name}
        </span>
        <span className="block text-caption text-muted-foreground md:hidden">
          {group.phoneDetail}
        </span>
        <span className="hidden text-caption text-muted-foreground md:block">
          {group.detail}
        </span>
      </span>
      <span className="hidden text-right text-caption text-muted-foreground md:block">
        {group.countText}
      </span>
      <span className="text-right text-body-sm tabular-nums">{group.total}</span>
      <span className="hidden justify-self-end md:block">
        {group.suggestion !== null && (
          <Badge quiet>{group.suggestion.name}</Badge>
        )}
      </span>
    </button>
  );
}

function OpenGroup({
  group,
  categories,
  panelId,
  pending,
  onAccept,
  onChange,
}: {
  group: MerchantGroup;
  categories: Categories;
  panelId: string;
  pending: boolean;
  onAccept: (edit: RowEdit) => void;
  onChange: ChangeRow;
}) {
  const [decision, setDecision] = useState(START_DECISION);
  const fieldId = useId();
  const edit = decisionEdit(decision);

  return (
    <div
      id={panelId}
      className="flex flex-col gap-4 border-t border-border bg-frost-wash px-4 pt-3 pb-4 md:px-6 md:pt-4 md:pb-5">
      <div className="grid gap-3 md:grid-cols-[148px_220px_minmax(0,1fr)_auto] md:items-end">
        <DecisionFields
          decision={decision}
          categories={categories}
          fieldId={fieldId}
          onChange={setDecision}
        />
        <SuggestionLine
          // Empty, it still holds its grid cell, so Accept stays at the end.
          className="order-first md:order-none md:empty:flex"
          suggestion={group.suggestion}
          shown={showsUse(decision, group.suggestion)}
          onUse={() =>
            group.suggestion !== null &&
            setDecision({
              type: "spending",
              categoryId: group.suggestion.categoryId,
            })
          }
        />
        <Button
          type="button"
          className="h-11 w-full md:h-9 md:w-auto"
          disabled={edit === null || pending}
          onClick={() => edit !== null && onAccept(edit)}>
          {pending ? "Saving..." : acceptLabel(group.count)}
        </Button>
      </div>
      <GroupTable rows={group.rows} onChange={onChange} />
      <GroupList rows={group.rows} onChange={onChange} />
    </div>
  );
}

/**
 * What the notice holds: a message, and the actions it offers while it shows.
 * A rule offer keeps the plain result for Skip.
 */
type InboxNotice = NoticeMessage & {
  offer?: { rule: InboxRuleOffer; plain: string };
  undo?: SortUndo | null;
  sortRest?: string | null;
};

/** The Add Rule dialog for an offer, or Edit Rule for the earlier rule it names. */
type RuleDialogTarget = { offer: InboxRuleOffer } | { earlier: RuleItem } | null;

function fromSort(notice: SortNotice): InboxNotice {
  return {
    tone: notice.tone,
    text: notice.text,
    undo: notice.undo,
    sortRest: notice.sortRest,
  };
}

function NoticeActions({
  notice,
  pending,
  onAddRule,
  onSkip,
  onSortRest,
  onUndo,
}: {
  notice: InboxNotice | null;
  pending: boolean;
  onAddRule: (offer: InboxRuleOffer) => void;
  onSkip: (plain: string) => void;
  onSortRest: (ruleId: string) => void;
  onUndo: (undo: SortUndo) => void;
}) {
  if (notice === null) return null;
  const { offer, sortRest, undo } = notice;
  if (offer === undefined && !sortRest && !undo) return null;

  return (
    <>
      {offer !== undefined && (
        <>
          <OutlineButton disabled={pending} onClick={() => onAddRule(offer.rule)}>
            Add Rule...
          </OutlineButton>
          <Button
            type="button"
            variant="ghost"
            className="h-11 md:h-9"
            disabled={pending}
            onClick={() => onSkip(offer.plain)}>
            Skip
          </Button>
        </>
      )}
      {sortRest && (
        <OutlineButton disabled={pending} onClick={() => onSortRest(sortRest)}>
          {pending ? "Sorting..." : "Sort the Rest"}
        </OutlineButton>
      )}
      {undo && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 md:h-9"
          disabled={pending}
          onClick={() => onUndo(undo)}>
          Undo
        </Button>
      )}
    </>
  );
}

/**
 * One group is open at a time, so the screen has one Accept. When the open
 * group is accepted it leaves the list, and the largest one left opens. After a
 * whole group saves, the notice may offer a rule; after a rule sorts rows, it
 * offers Undo until the next accept replaces it.
 */
export function MerchantGroups({
  groups,
  categories,
}: {
  groups: readonly MerchantGroup[];
  categories: Categories;
}) {
  // Undefined opens the largest group, which is first.
  const [openKey, setOpenKey] = useState<string | null | undefined>(undefined);
  const [changing, setChanging] = useState<TransactionLine | null>(null);
  const [message, setMessage] = useState<InboxNotice | null>(null);
  const [ruleTarget, setRuleTarget] = useState<RuleDialogTarget>(null);
  const { pending, run } = useServerAction();
  const panelPrefix = useId();

  const shownKey = groups.some(({ key }) => key === openKey)
    ? openKey
    : openKey === null
      ? null
      : groups[0]?.key;
  // Looked up each time, so a save shows what's now stored.
  const changingLine =
    changing === null
      ? null
      : (groups
          .flatMap(({ rows }) => rows)
          .find(({ id }) => id === changing.id) ?? null);

  function accept(group: MerchantGroup, edit: RowEdit) {
    setMessage(null);
    run(
      () => acceptGroupAction(group.rows.map(({ id }) => id), edit),
      (result) => {
        if (!result.ok) {
          setMessage({ tone: "error", text: result.message });
          return;
        }
        setOpenKey(undefined);
        setMessage(
          "offer" in result
            ? {
                tone: "done",
                lead: result.offer.name,
                text: offerText(result.offer),
                offer: { rule: result.offer, plain: result.notice },
              }
            : { tone: "done", text: result.notice },
        );
      },
    );
  }

  function sortRest(ruleId: string) {
    const before = message?.undo ?? null;
    run(
      async () => ({ ok: true as const, sorted: await sortByRuleAction(ruleId, true) }),
      (result) => {
        if (!result.ok) {
          setMessage({ tone: "error", text: result.message, undo: before, sortRest: ruleId });
          return;
        }
        const next = fromSort(result.sorted);
        const undo =
          before !== null && next.undo
            ? mergeUndo(before, next.undo)
            : (next.undo ?? before);
        setMessage({ ...next, undo });
      },
    );
  }

  function undo(token: SortUndo) {
    run(
      async () => ({ ok: true as const, sorted: await undoRuleSortAction(token) }),
      (result) => {
        if (result.ok) setMessage(fromSort(result.sorted));
        else setMessage({ tone: "error", text: result.message, undo: token });
      },
    );
  }

  const earlierItem = (offer: InboxRuleOffer, ruleId: string) =>
    storedRuleItem(offer, categories, ruleId);

  return (
    <>
      <Notice
        message={message}
        actions={
          <NoticeActions
            notice={message}
            pending={pending}
            onAddRule={(offer) => setRuleTarget({ offer })}
            onSkip={(plain) => setMessage({ tone: "done", text: plain })}
            onSortRest={sortRest}
            onUndo={undo}
          />
        }
      />
      <section
        aria-label="Merchants"
        className="overflow-hidden rounded-2xl bg-card shadow-glass">
        {groups.length === 0 ? (
          <p className="px-6 py-12 text-center text-body-sm text-moon-mist">
            All merchants are reviewed.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((group, index) => {
              const open = group.key === shownKey;
              // A merchant key can hold spaces, which an ID can't.
              const panelId = `${panelPrefix}-group-${index}`;
              return (
                <li key={group.key}>
                  <GroupButton
                    group={group}
                    open={open}
                    panelId={panelId}
                    onToggle={() => setOpenKey(open ? null : group.key)}
                  />
                  {open && (
                    <OpenGroup
                      key={group.key}
                      group={group}
                      categories={categories}
                      panelId={panelId}
                      pending={pending}
                      onAccept={(edit) => accept(group, edit)}
                      onChange={setChanging}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <EditRowDialog
        line={changingLine}
        categories={categories}
        onClose={() => setChanging(null)}
      />
      {ruleTarget !== null && "offer" in ruleTarget ? (
        <RuleDialog
          target="new"
          categories={categories}
          onClose={() => setRuleTarget(null)}
          inbox={{
            offer: ruleTarget.offer,
            onSaved: (notice) => {
              setRuleTarget(null);
              setMessage(fromSort(notice));
            },
            onEditEarlier: (ruleId) => {
              const item = earlierItem(ruleTarget.offer, ruleId);
              setRuleTarget(item === null ? null : { earlier: item });
            },
          }}
        />
      ) : (
        <RuleDialog
          target={ruleTarget === null ? null : ruleTarget.earlier}
          categories={categories}
          onClose={() => setRuleTarget(null)}
        />
      )}
    </>
  );
}
