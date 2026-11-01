"use client";

import { useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { OutlineButton } from "@/components/ui/action-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { glassField } from "@/components/ui/native-select";
import { FieldError, Notice, type NoticeMessage } from "@/components/ui/notice";
import { useServerAction } from "@/hooks/use-server-action";
import type { ActionResult } from "@/lib/actionResult";
import { cn } from "@/lib/utils";
import { copyMonthAction, saveBudgetAction } from "./actions";
import { checkAmount } from "./amountInput";
import type {
  BudgetLine,
  BudgetScreenData,
  ReadyBudgetScreen,
  TransactionLine,
} from "./budgetScreenData";
import { ScreenControls } from "./ScreenControls";
import {
  EmptyPanel,
  InfoNotice,
  Meter,
  NoRatePanel,
  RemainingAmount,
} from "./ScreenParts";
import type { ScreenParams } from "./screenParams";
import {
  copyButtonText,
  saveButtonText,
  type BudgetAction,
} from "./screenText";

const FORM_ID = "budget-form";

/** What a line needs from the screen, shared by the table and the phone list. */
type LineControls = {
  editable: boolean;
  textOf: (line: BudgetLine) => string;
  errorOf: (line: BudgetLine) => string | null;
  setText: (line: BudgetLine, text: string) => void;
  isOpen: (line: BudgetLine) => boolean;
  toggle: (line: BudgetLine) => void;
  noTransactions: string;
};

function CategoryToggle({
  line,
  controls,
}: {
  line: BudgetLine;
  controls: LineControls;
}) {
  const open = controls.isOpen(line);

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${line.name} transactions`}
      onClick={() => controls.toggle(line)}
      className="inline-flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md text-left outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring md:min-h-9">
      <ChevronRight
        className={cn(
          "size-4 shrink-0 transition-transform motion-reduce:transition-none",
          open && "rotate-90",
        )}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="[overflow-wrap:anywhere]">{line.name}</span>
    </button>
  );
}

function AmountCell({
  line,
  controls,
}: {
  line: BudgetLine;
  controls: LineControls;
}) {
  if (!controls.editable) {
    return <span className="tabular-nums">{line.budgeted}</span>;
  }

  const error = controls.errorOf(line);
  return (
    <div className="flex flex-col items-end gap-1">
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        aria-label={`Budget for ${line.name}`}
        aria-invalid={error !== null}
        value={controls.textOf(line)}
        onChange={(event) => controls.setText(line, event.target.value)}
        className={cn(
          glassField,
          "w-[120px] text-right tabular-nums md:h-8 md:w-28",
          error && "ring-1 ring-ember-glow/25 ring-inset",
        )}
      />
      <FieldError message={error} />
    </div>
  );
}

function AmountWithOriginal({ line }: { line: TransactionLine }) {
  return (
    <>
      <div className="tabular-nums">{line.amount}</div>
      {line.original !== null && (
        <div className="text-caption text-muted-foreground tabular-nums">
          {line.original}
        </div>
      )}
    </>
  );
}

function TransactionTable({
  line,
  empty,
}: {
  line: BudgetLine;
  empty: string;
}) {
  if (line.transactions.length === 0) {
    return <p className="py-2 text-caption text-muted-foreground">{empty}</p>;
  }

  return (
    <table className="w-full table-fixed text-body-sm">
      <caption className="sr-only">{`${line.name} transactions`}</caption>
      <thead className="text-left text-caption text-muted-foreground">
        <tr className="border-b border-border">
          <th scope="col" className="w-16 py-2 pr-4 font-medium">
            Date
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Description
          </th>
          <th scope="col" className="w-36 py-2 pr-4 font-medium">
            Account
          </th>
          <th scope="col" className="w-28 py-2 text-right font-medium">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {line.transactions.map((transaction) => (
          <tr
            key={transaction.id}
            className="border-b border-border align-top last:border-b-0">
            <td className="py-2 pr-4 text-muted-foreground">
              {transaction.date}
            </td>
            <td className="py-2 pr-4 [overflow-wrap:anywhere]">
              {transaction.description}
            </td>
            <td className="py-2 pr-4 text-muted-foreground [overflow-wrap:anywhere]">
              {transaction.account}
            </td>
            <td className="py-2 text-right">
              <AmountWithOriginal line={transaction} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TransactionList({
  line,
  empty,
}: {
  line: BudgetLine;
  empty: string;
}) {
  if (line.transactions.length === 0) {
    return <p className="text-caption text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-xl bg-frost-wash px-3 py-1">
      {line.transactions.map((transaction) => (
        <li key={transaction.id} className="py-2">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {transaction.description}
            </span>
            <div className="shrink-0 text-right">
              <AmountWithOriginal line={transaction} />
            </div>
          </div>
          <div className="text-caption text-muted-foreground">
            {`${transaction.date} · ${transaction.account}`}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SetupHead({ screen }: { screen: ReadyBudgetScreen }) {
  if (screen.setup.kind !== "first") return null;

  return (
    <div className="px-4 py-4 md:px-6 md:py-5">
      <h2 className="text-body font-medium text-ice-highlight">
        {screen.setup.title}
      </h2>
      <p className="mt-0.5 text-caption text-muted-foreground">
        {screen.setup.text}
      </p>
    </div>
  );
}

function BudgetTable({
  screen,
  controls,
}: {
  screen: ReadyBudgetScreen;
  controls: LineControls;
}) {
  const { lines, totals } = screen;

  return (
    <section
      aria-label="Budget by category"
      className="hidden overflow-hidden rounded-2xl bg-card shadow-glass md:block">
      <SetupHead screen={screen} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-body-sm">
          <caption className="sr-only">
            Budgeted, spent and remaining by category
          </caption>
          <thead className="bg-background text-caption text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2.5 pr-2 pl-6 text-left font-medium">
                Category
              </th>
              <th scope="col" className="w-36 px-2 py-2.5 text-right font-medium">
                Budgeted
              </th>
              <th scope="col" className="w-28 px-2 py-2.5 text-right font-medium">
                Spent
              </th>
              <th scope="col" className="w-32 px-2 py-2.5 text-right font-medium">
                Remaining
              </th>
              <th scope="col" className="w-36 py-2.5 pr-6 pl-2 text-left font-medium">
                Used
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <LineRows key={line.categoryId} line={line} controls={controls} />
            ))}
          </tbody>
          <tfoot className="bg-frost-wash font-medium text-ice-highlight">
            <tr>
              <th scope="row" className="py-3 pr-2 pl-6 text-left font-medium">
                Total
              </th>
              <td className="px-2 py-3 text-right tabular-nums">
                {totals.budgeted}
              </td>
              <td className="px-2 py-3 text-right tabular-nums">
                {totals.spent}
              </td>
              <td className="px-2 py-3 text-right tabular-nums">
                <RemainingAmount text={totals.remaining} over={totals.over} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function LineRows({
  line,
  controls,
}: {
  line: BudgetLine;
  controls: LineControls;
}) {
  return (
    <>
      <tr className="border-b border-border">
        <th scope="row" className="py-1.5 pr-2 pl-6 text-left font-normal">
          <CategoryToggle line={line} controls={controls} />
        </th>
        <td className="px-2 py-1.5 text-right">
          <AmountCell line={line} controls={controls} />
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{line.spent}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          <RemainingAmount text={line.remaining} over={line.over} />
        </td>
        <td className="py-1.5 pr-6 pl-2">
          <Meter
            percent={line.used.percent}
            label={line.used.label}
            over={line.over}
          />
        </td>
      </tr>
      {controls.isOpen(line) && (
        <tr className="border-b border-border bg-frost-wash">
          <td colSpan={5} className="py-1 pr-6 pb-3 pl-12">
            <TransactionTable line={line} empty={controls.noTransactions} />
          </td>
        </tr>
      )}
    </>
  );
}

function PhoneFigure({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-caption font-medium text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1.5 text-subheading font-medium", className)}>
        {value}
      </div>
    </div>
  );
}

function BudgetCards({
  screen,
  controls,
}: {
  screen: ReadyBudgetScreen;
  controls: LineControls;
}) {
  const { lines, totals } = screen;

  return (
    <div className="flex flex-col gap-4 md:hidden">
      <section
        aria-label="Totals"
        className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-glass">
        <div className="grid grid-cols-2 gap-3">
          <PhoneFigure
            label="Budgeted"
            value={totals.budgeted}
            className="text-moon-mist"
          />
          <PhoneFigure
            label="Spent"
            value={totals.spent}
            className="text-moon-mist"
          />
        </div>
        <div>
          <div className="text-caption font-medium text-muted-foreground">
            Remaining
          </div>
          <div className="mt-1.5 text-[32px] leading-[1.1] font-medium text-ice-highlight">
            <RemainingAmount text={totals.remaining} over={totals.over} />
          </div>
        </div>
      </section>

      <section
        aria-label="Budget by category"
        className="overflow-hidden rounded-2xl bg-card shadow-glass">
        <SetupHead screen={screen} />
        <ul className="divide-y divide-border text-body-sm">
          {lines.map((line) => (
            <li
              key={line.categoryId}
              className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 font-medium">
                  <CategoryToggle line={line} controls={controls} />
                </div>
                <div className="flex min-h-11 items-center">
                  <AmountCell line={line} controls={controls} />
                </div>
              </div>
              <Meter
                percent={line.used.percent}
                label={line.used.label}
                over={line.over}
              />
              <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground tabular-nums">
                <span>{`${line.spent} spent`}</span>
                <RemainingAmount
                  text={line.remaining}
                  over={line.over}
                  suffix=" left"
                />
              </div>
              {controls.isOpen(line) && (
                <TransactionList line={line} empty={controls.noTransactions} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReadyBudget({
  params,
  screen,
}: {
  params: ScreenParams;
  screen: ReadyBudgetScreen;
}) {
  const { month } = params;
  const { country, currency, lines, setup } = screen;

  // Only what's been typed, so saved amounts always come from the server.
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({});
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [action, setAction] = useState<BudgetAction>("save");
  const { pending, run } = useServerAction();

  const running = pending ? action : null;
  const editable = country !== null;
  const textOf = (line: BudgetLine) =>
    edits[line.categoryId] ?? line.amountInput;

  const controls: LineControls = {
    editable,
    textOf,
    errorOf(line) {
      if (!showErrors) return null;
      const check = checkAmount(textOf(line), currency);
      return check.ok ? null : check.message;
    },
    setText(line, text) {
      setEdits({ ...edits, [line.categoryId]: text });
    },
    isOpen: (line) => openIds.has(line.categoryId),
    toggle(line) {
      const next = new Set(openIds);
      if (!next.delete(line.categoryId)) next.add(line.categoryId);
      setOpenIds(next);
    },
    noTransactions: screen.noTransactions,
  };

  function report(result: ActionResult) {
    setNotice(
      result.ok
        ? { tone: "done", text: result.notice ?? "" }
        : { tone: "error", text: result.message },
    );
    if (result.ok) {
      setEdits({});
      setShowErrors(false);
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (country === null) return;

    const amounts = Object.fromEntries(
      lines.map((line) => [line.categoryId, textOf(line)]),
    );
    setShowErrors(true);
    setNotice(null);
    setAction("save");
    run(() => saveBudgetAction(month, country, amounts), report);
  }

  function handleCopy(from: string) {
    if (country === null) return;

    setNotice(null);
    setAction("copy");
    run(() => copyMonthAction(from, month, country), report);
  }

  const saveLabel = saveButtonText(running);
  // Violet is for the one main action, which is Copy when it's on offer.
  const SaveButton = setup.kind === "copy" ? OutlineButton : Button;

  return (
    <PageFrame
      title="Budget"
      subtitle={screen.subtitle}
      action={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:flex-wrap md:items-center">
          <ScreenControls path="/budget" params={params} />
          {editable && lines.length > 0 && (
            <SaveButton
              type="submit"
              form={FORM_ID}
              disabled={pending}
              className="hidden h-9 md:inline-flex">
              {saveLabel}
            </SaveButton>
          )}
        </div>
      }>
      <Notice message={notice} />
      <InfoNotice text={screen.review} />

      {setup.kind === "copy" && (
        <EmptyPanel title={setup.title} text={setup.text}>
          <Button
            type="button"
            className="h-11 md:h-9"
            disabled={pending}
            onClick={() => handleCopy(setup.from)}>
            {copyButtonText(running, setup.fromLabel)}
          </Button>
        </EmptyPanel>
      )}

      {lines.length === 0 ? (
        <InfoNotice text="No categories yet. Add one in Settings to set a budget." />
      ) : (
        <form
          id={FORM_ID}
          noValidate
          onSubmit={handleSave}
          className="flex flex-col gap-4 md:gap-8">
          <BudgetTable screen={screen} controls={controls} />
          <BudgetCards screen={screen} controls={controls} />
          {editable && (
            <SaveButton
              type="submit"
              disabled={pending}
              className="h-11 w-full md:hidden">
              {saveLabel}
            </SaveButton>
          )}
        </form>
      )}
    </PageFrame>
  );
}

export function BudgetScreen({
  params,
  screen,
}: {
  params: ScreenParams;
  screen: BudgetScreenData | null;
}) {
  if (screen?.status === "ready") {
    return <ReadyBudget params={params} screen={screen} />;
  }

  return (
    <PageFrame
      title="Budget"
      subtitle={screen?.subtitle ?? ""}
      action={<ScreenControls path="/budget" params={params} />}>
      {screen === null ? (
        <Notice
          message={{
            tone: "error",
            text: "This month can't be loaded. Reload the page to try again.",
          }}
        />
      ) : (
        <NoRatePanel message={screen.message} />
      )}
    </PageFrame>
  );
}
