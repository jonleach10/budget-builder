"use client";

import { useId, useState, type ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RuleDialogView, SortSummary } from "./ruleDialogView";

const BOX = "flex flex-col gap-2 rounded-xl bg-frost-wash px-4 py-3 shadow-hairline";
const INDENT = "pl-8 md:pl-7";

function ShowRows({ sort }: { sort: SortSummary }) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${INDENT}`}>
        <span className="text-caption text-muted-foreground">{sort.detail}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className="min-h-11 rounded-md px-1 text-caption font-medium text-foreground underline underline-offset-2 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring md:min-h-6">
          {open ? "Hide Rows" : "Show Rows"}
        </button>
      </div>
      {sort.bothCountries && (
        <p className={`flex items-start gap-2 text-caption text-moon-mist ${INDENT}`}>
          <TriangleAlert
            className="mt-px size-3.5 shrink-0 text-ember-glow"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span>Rows in both countries match. Check the rows before you sort them.</span>
        </p>
      )}
      {open && (
        <div id={listId} className={`mt-1 ml-8 border-t border-border md:ml-7`}>
          <ul aria-label="Rows this rule sorts">
            {sort.preview.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[44px_minmax(0,1fr)_72px] items-baseline gap-x-2.5 border-b border-border py-1.5 text-caption md:grid-cols-[52px_minmax(0,1fr)_96px_76px]">
                <span className="text-muted-foreground">{row.date}</span>
                <span className="min-w-0">
                  <span className="block font-eyebrow text-foreground [overflow-wrap:anywhere] md:truncate">
                    {row.description}
                  </span>
                  {/* A phone has no room for an account column, so it sits under the text. */}
                  <span className="block truncate text-muted-foreground md:hidden">
                    {row.account}
                  </span>
                </span>
                <span className="hidden truncate text-muted-foreground md:block">
                  {row.account}
                </span>
                <span className="text-right tabular-nums text-foreground">
                  {row.amount}
                </span>
              </li>
            ))}
          </ul>
          {sort.more !== null && (
            <p className="pt-1.5 text-caption text-muted-foreground">{sort.more}</p>
          )}
        </div>
      )}
    </>
  );
}

function InfoLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-body-sm text-moon-mist">
      <Info className="mt-0.5 size-4 shrink-0 text-ring" strokeWidth={1.5} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The "Also sort" step under the rule, or why the rule can't be added. The box
 * shows only when the rule would sort a row, and starts unticked.
 */
export function RuleSortBox({
  view,
  alsoSort,
  disabled,
  onAlsoSort,
}: {
  view: RuleDialogView;
  alsoSort: boolean;
  disabled: boolean;
  onAlsoSort: (checked: boolean) => void;
}) {
  const boxId = useId();

  if (view.kind === "earlier") {
    return (
      <div className={BOX}>
        <InfoLine>An earlier rule matches this row first, so this rule would never run.</InfoLine>
        <p className="flex flex-wrap items-center gap-1.5 pl-6 text-caption">
          <span className="text-muted-foreground">{view.matchLabel}</span>
          <span className="font-eyebrow text-foreground [overflow-wrap:anywhere]">
            {view.value}
          </span>
          <span className="text-muted-foreground">gives</span>
          <Badge quiet>{view.typeLabel}</Badge>
          {view.category === null ? (
            view.typeLabel === "Spending" && (
              <span className="text-muted-foreground">with no category</span>
            )
          ) : (
            <Badge>{view.category}</Badge>
          )}
        </p>
      </div>
    );
  }

  if (view.kind === "exists") {
    return (
      <div className={BOX}>
        <InfoLine>{view.text}</InfoLine>
        {view.sort !== null && <ShowRows sort={view.sort} />}
      </div>
    );
  }

  if (view.sort === null) {
    return (
      <div className={BOX}>
        <p className="text-body-sm text-muted-foreground">
          No other rows in review match this rule.
        </p>
      </div>
    );
  }

  return (
    <div className={BOX}>
      <label
        htmlFor={boxId}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 md:min-h-0 md:items-start">
        <input
          id={boxId}
          type="checkbox"
          checked={alsoSort}
          disabled={disabled}
          onChange={(event) => onAlsoSort(event.target.checked)}
          className="size-[22px] shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring md:mt-px md:size-[18px]"
        />
        <span className="text-body-sm font-medium tabular-nums text-ice-highlight">
          {view.sort.checkLabel}
        </span>
      </label>
      <ShowRows sort={view.sort} />
    </div>
  );
}
