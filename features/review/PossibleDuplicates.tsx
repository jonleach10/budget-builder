"use client";

import { useState } from "react";
import { OutlineButton } from "@/components/ui/action-buttons";
import { Notice, type NoticeMessage } from "@/components/ui/notice";
import { AmountWithOriginal } from "@/features/budget/ScreenParts";
import { editRowAction } from "@/features/transactions/actions";
import type { RowEdit } from "@/features/transactions/rowEdits";
import type { TransactionLine } from "@/features/transactions/transactionsScreenData";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";

type Decide = (line: TransactionLine, edit: RowEdit) => void;

const DISMISS: RowEdit = { possibleDuplicate: false };
const HIDE: RowEdit = { hidden: true };

function rowName(line: TransactionLine): string {
  return `${line.title} from ${line.date}`;
}

function Actions({
  line,
  pending,
  onDecide,
}: {
  line: TransactionLine;
  pending: boolean;
  onDecide: Decide;
}) {
  return (
    <span className="flex shrink-0 justify-end gap-2">
      <OutlineButton
        aria-label={`Dismiss ${rowName(line)}`}
        className="md:h-8 md:px-3"
        disabled={pending}
        onClick={() => onDecide(line, DISMISS)}>
        Dismiss
      </OutlineButton>
      <OutlineButton
        aria-label={`Hide Row for ${rowName(line)}`}
        className="md:h-8 md:px-3"
        disabled={pending}
        onClick={() => onDecide(line, HIDE)}>
        Hide Row
      </OutlineButton>
    </span>
  );
}

function Title({ line }: { line: TransactionLine }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="font-eyebrow text-foreground">{line.title}</div>
      {line.bankText !== null && (
        <div className="text-caption text-muted-foreground">{line.bankText}</div>
      )}
    </div>
  );
}

const HEAD = "py-2 px-2 text-left font-medium";

function DuplicateTable({
  rows,
  pending,
  onDecide,
}: {
  rows: readonly TransactionLine[];
  pending: boolean;
  onDecide: Decide;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[720px] table-fixed text-body-sm">
        <caption className="sr-only">Possible duplicates, newest first</caption>
        <thead className="text-caption text-muted-foreground">
          <tr className="border-b border-border">
            {/* Wide enough for a date from another year, which shows its year. */}
            <th scope="col" className={cn(HEAD, "w-[124px] pl-6")}>Date</th>
            <th scope="col" className={HEAD}>Description</th>
            <th scope="col" className={cn(HEAD, "w-32")}>Account</th>
            <th scope="col" className={cn(HEAD, "w-28 text-right")}>Amount</th>
            <th scope="col" className={cn(HEAD, "w-[208px] pr-6 text-right")}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.id} className="border-b border-border align-top last:border-b-0">
              <td className="py-2.5 pr-2 pl-6 whitespace-nowrap text-muted-foreground">
                {line.date}
              </td>
              <td className="px-2 py-2.5">
                <Title line={line} />
              </td>
              <td className="px-2 py-2.5 text-moon-mist [overflow-wrap:anywhere]">
                {line.account}
              </td>
              <td className="px-2 py-2.5 text-right">
                <AmountWithOriginal line={line} />
              </td>
              <td className="py-1.5 pr-6 pl-2">
                <Actions line={line} pending={pending} onDecide={onDecide} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DuplicateList({
  rows,
  pending,
  onDecide,
}: {
  rows: readonly TransactionLine[];
  pending: boolean;
  onDecide: Decide;
}) {
  return (
    <ul aria-label="Possible duplicates" className="divide-y divide-border px-4 text-body-sm md:hidden">
      {rows.map((line) => (
        <li key={line.id} className="flex flex-col gap-2 py-3">
          <div className="flex items-start justify-between gap-3">
            <Title line={line} />
            <div className="shrink-0 text-right">
              <AmountWithOriginal line={line} />
            </div>
          </div>
          <div className="text-caption text-muted-foreground [overflow-wrap:anywhere]">
            {`${line.date} · ${line.account}`}
          </div>
          <Actions line={line} pending={pending} onDecide={onDecide} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Rows the import found twice in one file. Each counts in totals until it's
 * hidden, so Dismiss keeps it and Hide Row takes it out.
 */
export function PossibleDuplicates({ rows }: { rows: readonly TransactionLine[] }) {
  const [message, setMessage] = useState<NoticeMessage | null>(null);
  const { pending, run } = useServerAction();

  function decide(line: TransactionLine, edit: RowEdit) {
    setMessage(null);
    run(
      () => editRowAction(line.id, edit),
      (result) => {
        if (!result.ok) setMessage({ tone: "error", text: result.message });
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted-foreground">
        These rows match another row in the same file. They stay in your totals
        until you hide one. A row can appear here and under Merchants.
      </p>
      <Notice message={message} />
      <section
        aria-label="Possible duplicates"
        className="overflow-hidden rounded-2xl bg-card shadow-glass">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-body-sm text-moon-mist">
            No possible duplicates.
          </p>
        ) : (
          <>
            <DuplicateTable rows={rows} pending={pending} onDecide={decide} />
            <DuplicateList rows={rows} pending={pending} onDecide={decide} />
          </>
        )}
      </section>
    </div>
  );
}
