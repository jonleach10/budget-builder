"use client";

import { useState } from "react";
import { OutlineButton } from "@/components/ui/action-buttons";
import { NativeSelect } from "@/components/ui/native-select";
import { Notice, type NoticeMessage } from "@/components/ui/notice";
import { AmountWithOriginal } from "@/features/budget/ScreenParts";
import type { TransactionType } from "@/features/categorize/transactionType";
import { TYPE_OPTIONS } from "@/features/rules/rules";
import { editRowAction } from "@/features/transactions/actions";
import type { TransactionLine } from "@/features/transactions/transactionsScreenData";
import { useServerAction } from "@/hooks/use-server-action";
import type { ActionResult } from "@/lib/actionResult";
import { confirmTransferAction } from "./actions";
import type { TransferMatch } from "./reviewInbox";

/** Giving a row Transfer would keep it in the match, so it isn't offered here. */
const TYPES_OUT_OF_A_MATCH = TYPE_OPTIONS.filter(({ value }) => value !== "transfer");

type Report = (result: ActionResult) => void;

function rowName(line: TransactionLine): string {
  return `${line.title} from ${line.date}`;
}

function MatchRow({
  line,
  checked,
  pending,
  onToggle,
  onType,
}: {
  line: TransactionLine;
  checked: boolean;
  pending: boolean;
  onToggle: () => void;
  onType: (type: TransactionType) => void;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-3 md:grid-cols-[auto_64px_minmax(0,1fr)_128px_112px_148px] md:items-center md:py-2">
      <input
        type="checkbox"
        aria-label={`Select ${rowName(line)}`}
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 size-[18px] accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring md:mt-0"
      />
      <span className="hidden text-muted-foreground md:block">{line.date}</span>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <div className="font-eyebrow text-foreground">{line.title}</div>
        {line.bankText !== null && (
          <div className="text-caption text-muted-foreground">{line.bankText}</div>
        )}
        <div className="text-caption text-muted-foreground md:hidden">
          {`${line.date} · ${line.account}`}
        </div>
      </div>
      <span className="hidden text-moon-mist [overflow-wrap:anywhere] md:block">
        {line.account}
      </span>
      <div className="text-right">
        <AmountWithOriginal line={line} />
      </div>
      <NativeSelect
        aria-label={`Set type for ${rowName(line)}`}
        className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto"
        value=""
        disabled={pending}
        onChange={(event) => onType(event.target.value as TransactionType)}>
        <option value="">Set Type</option>
        {TYPES_OUT_OF_A_MATCH.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
    </li>
  );
}

function MatchCard({
  match,
  pending,
  run,
  report,
}: {
  match: TransferMatch;
  pending: boolean;
  run: ReturnType<typeof useServerAction>["run"];
  report: Report;
}) {
  const [picked, setPicked] = useState<string[]>(match.picked);
  // A row that left the match can't stay picked.
  const shownPicked = picked.filter((id) => match.rows.some((line) => line.id === id));

  function toggle(id: string) {
    setPicked(
      shownPicked.includes(id)
        ? shownPicked.filter((each) => each !== id)
        : [...shownPicked, id],
    );
  }

  return (
    <section
      aria-label={match.title}
      className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-body-sm shadow-glass md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-body font-medium text-ice-highlight">{match.title}</h2>
          <p className="mt-0.5 text-caption text-muted-foreground">{match.help}</p>
        </div>
        <OutlineButton
          className="w-full md:w-auto"
          disabled={shownPicked.length !== 2 || pending}
          onClick={() => run(() => confirmTransferAction(shownPicked), report)}>
          Mark as Transfer
        </OutlineButton>
      </div>
      <ul aria-label={`Rows in ${match.title}`} className="divide-y divide-border">
        {match.rows.map((line) => (
          <MatchRow
            key={line.id}
            line={line}
            checked={shownPicked.includes(line.id)}
            pending={pending}
            onToggle={() => toggle(line.id)}
            onType={(type) => run(() => editRowAction(line.id, { type }), report)}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Rows that may be one transfer. Nothing here is stored until the owner marks
 * two rows, or gives a row a type, which takes it out of the match.
 */
export function PossibleTransfers({ matches }: { matches: readonly TransferMatch[] }) {
  const [message, setMessage] = useState<NoticeMessage | null>(null);
  const { pending, run } = useServerAction();

  function report(result: ActionResult) {
    if (result.ok) {
      setMessage(result.notice === undefined ? null : { tone: "done", text: result.notice });
    } else {
      setMessage({ tone: "error", text: result.message });
    }
  }

  if (matches.length === 0) {
    return (
      <>
        <Notice message={message} />
        <p className="rounded-2xl bg-card px-6 py-12 text-center text-body-sm text-moon-mist shadow-glass">
          No possible transfers.
        </p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted-foreground">
        These rows may be one transfer. A transfer stays out of your budget. Give a
        row a type to take it out of the match.
      </p>
      <Notice message={message} />
      {matches.map((match) => (
        <MatchCard
          key={match.key}
          match={match}
          pending={pending}
          run={run}
          report={report}
        />
      ))}
    </div>
  );
}
