"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Link as ChainLink, List } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { OutlineButton } from "@/components/ui/action-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { glassField, NativeSelect } from "@/components/ui/native-select";
import { Notice } from "@/components/ui/notice";
import { MonthControl } from "@/features/budget/ScreenControls";
import { AmountWithOriginal, EmptyPanel } from "@/features/budget/ScreenParts";
import { TYPE_OPTIONS } from "@/features/rules/rules";
import { cn } from "@/lib/utils";
import { CheckField } from "./CheckField";
import { EditRowDialog } from "./EditRow";
import {
  clearFilters,
  NO_FILTERS,
  showsCategoryFilter,
  transactionsView,
  withType,
  type EmptyState,
  type TransactionFilters,
} from "./filterTransactions";
import type {
  TransactionLine,
  TransactionsScreenData,
} from "./transactionsScreenData";
import {
  paramsOf,
  readTransactionFilters,
  transactionsHref,
} from "./transactionsParams";

const GHOST_PILL =
  "h-11 bg-frost-wash text-white shadow-hairline hover:bg-accent md:h-9";

export function TransactionFiltersBar({
  filters,
  accounts,
  categories,
  onChange,
}: {
  filters: TransactionFilters;
  accounts: TransactionsScreenData["accounts"];
  categories: TransactionsScreenData["categories"];
  onChange: (filters: TransactionFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <Input
        type="search"
        aria-label="Search this month"
        placeholder="Search this month"
        value={filters.search}
        onChange={(event) =>
          onChange({ ...filters, search: event.target.value })
        }
        className={cn(glassField, "md:w-auto md:min-w-[200px] md:flex-1")}
      />
      <div className="grid grid-cols-2 gap-3 md:contents">
        <NativeSelect
          aria-label="Account"
          value={filters.accountId}
          onChange={(event) =>
            onChange({ ...filters, accountId: event.target.value })
          }
          className="md:w-[168px]">
          <option value="">All Accounts</option>
          {accounts.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Type"
          value={filters.type}
          onChange={(event) =>
            onChange(
              withType(
                filters,
                event.target.value as TransactionFilters["type"],
              ),
            )
          }
          className="md:w-[148px]">
          <option value="">All Types</option>
          {TYPE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {showsCategoryFilter(filters) && (
        <NativeSelect
          aria-label="Category"
          value={filters.categoryId}
          onChange={(event) =>
            onChange({ ...filters, categoryId: event.target.value })
          }
          className="md:w-[172px]">
          <option value="">All Categories</option>
          {categories.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
      )}
      <div className="flex items-center justify-between gap-3 md:contents">
        <CheckField
          label="Needs Review"
          checked={filters.needsReview}
          onChange={(needsReview) => onChange({ ...filters, needsReview })}
        />
        <CheckField
          label="Show Hidden"
          checked={filters.showHidden}
          onChange={(showHidden) => onChange({ ...filters, showHidden })}
        />
      </div>
    </div>
  );
}

function Muted({ text }: { text: string }) {
  return <span className="text-muted-foreground">{text}</span>;
}

function PairedTag() {
  return (
    <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
      <ChainLink className="size-3" strokeWidth={1.5} aria-hidden="true" />
      Paired
    </span>
  );
}

function RowTitle({ line }: { line: TransactionLine }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div>{line.title}</div>
      {line.bankText !== null && (
        <div className="text-caption text-muted-foreground">
          {line.bankText}
        </div>
      )}
      {line.hidden && (
        <div className="text-caption text-muted-foreground">Hidden</div>
      )}
    </div>
  );
}

function TypeCell({ line }: { line: TransactionLine }) {
  if (line.typeLabel !== null) return <Badge quiet>{line.typeLabel}</Badge>;
  return line.needsReview ? <Badge>Needs Review</Badge> : <Muted text="-" />;
}

function CategoryCell({ line }: { line: TransactionLine }) {
  if (line.type === "spending" && line.needsReview) {
    return <Badge>Needs Review</Badge>;
  }
  if (line.paired) return <PairedTag />;
  if (line.type === null) return null;
  return line.category === null ? <Muted text="-" /> : line.category;
}

type EditRow = (id: string) => void;

export function EditButton({
  line,
  onEdit,
}: {
  line: TransactionLine;
  onEdit: EditRow;
}) {
  return (
    <OutlineButton
      aria-label={`Edit ${line.title}`}
      className="md:h-8 md:px-3"
      onClick={() => onEdit(line.id)}>
      Edit
    </OutlineButton>
  );
}

function TransactionTable({
  lines,
  onEdit,
}: {
  lines: readonly TransactionLine[];
  onEdit: EditRow;
}) {
  return (
    <section
      aria-label="Transactions"
      className="hidden overflow-hidden rounded-2xl bg-card shadow-glass md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-body-sm">
          <caption className="sr-only">
            Transactions for the month, newest first
          </caption>
          <thead className="bg-background text-caption text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="w-[88px] py-2.5 pr-2 pl-6 text-left font-medium">
                Date
              </th>
              <th scope="col" className="px-2 py-2.5 text-left font-medium">
                Description
              </th>
              <th scope="col" className="w-32 px-2 py-2.5 text-left font-medium">
                Account
              </th>
              <th scope="col" className="w-28 px-2 py-2.5 text-left font-medium">
                Type
              </th>
              <th scope="col" className="w-36 px-2 py-2.5 text-left font-medium">
                Category
              </th>
              <th scope="col" className="w-36 px-2 py-2.5 text-right font-medium">
                Amount
              </th>
              <th scope="col" className="w-[88px] py-2.5 pr-6 pl-2 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.id}
                className={cn(
                  "border-b border-border align-top last:border-b-0",
                  line.hidden && "opacity-60",
                )}>
                <td className="py-2.5 pr-2 pl-6 text-muted-foreground">
                  {line.date}
                </td>
                <td className="px-2 py-2.5">
                  <RowTitle line={line} />
                </td>
                <td className="px-2 py-2.5 text-moon-mist [overflow-wrap:anywhere]">
                  {line.account}
                </td>
                <td className="px-2 py-2.5">
                  <TypeCell line={line} />
                </td>
                <td className="px-2 py-2.5 [overflow-wrap:anywhere]">
                  <CategoryCell line={line} />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <AmountWithOriginal line={line} />
                </td>
                <td className="py-1.5 pr-6 pl-2 text-right">
                  <EditButton line={line} onEdit={onEdit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionCards({
  lines,
  onEdit,
}: {
  lines: readonly TransactionLine[];
  onEdit: EditRow;
}) {
  return (
    <section
      aria-label="Transactions"
      className="overflow-hidden rounded-2xl bg-card shadow-glass md:hidden">
      <ul className="divide-y divide-border text-body-sm">
        {lines.map((line) => (
          <li
            key={line.id}
            className={cn(
              "flex flex-col gap-2 px-4 py-3",
              line.hidden && "opacity-60",
            )}>
            <div className="flex items-start justify-between gap-3">
              <RowTitle line={line} />
              <div className="shrink-0 text-right">
                <AmountWithOriginal line={line} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-caption text-muted-foreground [overflow-wrap:anywhere]">
                {`${line.date} · ${line.account}`}
              </div>
              <EditButton line={line} onEdit={onEdit} />
            </div>
            <div className="flex flex-wrap gap-1.5 empty:hidden">
              {line.needsReview && <Badge>Needs Review</Badge>}
              {line.typeLabel !== null && (
                <Badge quiet>{line.typeLabel}</Badge>
              )}
              {line.category !== null && (
                <Badge quiet className="[overflow-wrap:anywhere]">
                  {line.category}
                </Badge>
              )}
              {line.paired && <Badge quiet>Paired</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyMonth({ title, text }: { title: string; text: string }) {
  return (
    <EmptyPanel
      title={title}
      text={text}
      icon={
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-frost-wash text-foreground shadow-hairline">
          <List className="size-6" strokeWidth={1.5} aria-hidden="true" />
        </span>
      }>
      <Button asChild variant="ghost" className={GHOST_PILL}>
        <Link href="/import">Go to Import</Link>
      </Button>
    </EmptyPanel>
  );
}

function NoResults({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-12 text-center shadow-glass">
      <h2 className="text-body font-medium text-ice-highlight">{title}</h2>
      {text && <p className="text-body-sm text-moon-mist">{text}</p>}
      {children}
    </section>
  );
}

export function MonthRows({
  lines,
  empty,
  filters,
  onChange,
  onEdit,
}: {
  lines: readonly TransactionLine[];
  empty: Exclude<EmptyState, { kind: "month" }> | null;
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  onEdit: EditRow;
}) {
  if (empty === null) {
    return (
      <>
        <TransactionTable lines={lines} onEdit={onEdit} />
        <TransactionCards lines={lines} onEdit={onEdit} />
      </>
    );
  }
  if (empty.kind === "all-hidden") {
    return <NoResults title={empty.title} text={empty.text} />;
  }
  return (
    <NoResults title={empty.title}>
      <Button
        type="button"
        variant="ghost"
        className={GHOST_PILL}
        onClick={() => onChange(clearFilters(filters))}>
        Clear Filters
      </Button>
    </NoResults>
  );
}

function HeaderMonthControl({
  month,
  hrefFor = (to) => transactionsHref(to),
}: {
  month: string;
  hrefFor?: (month: string) => string;
}) {
  return (
    <div className="w-full md:w-auto">
      <MonthControl month={month} hrefFor={hrefFor} />
    </div>
  );
}

function ReadyTransactions({
  month,
  screen,
}: {
  month: string;
  screen: TransactionsScreenData;
}) {
  // The account, type and category live in the URL, so a reload or a link keeps
  // them, and the month links carry them over. The rest stay on the screen, which
  // isn't keyed by month, so they carry over too.
  const fromUrl = readTransactionFilters(paramsOf(useSearchParams()), screen);
  const [onScreen, setOnScreen] = useState(NO_FILTERS);
  const filters: TransactionFilters = { ...onScreen, ...fromUrl };
  const [editingId, setEditingId] = useState<string | null>(null);

  function setFilters(next: TransactionFilters) {
    setOnScreen(next);
    const href = transactionsHref(month, next);
    // Replaced, not pushed, so Back leaves Transactions rather than undoing a filter.
    if (href !== transactionsHref(month, filters)) {
      window.history.replaceState(null, "", href);
    }
  }
  const { lines, subtitle, empty } = transactionsView(
    screen.lines,
    filters,
    month,
  );
  // Looked up each time, so a save that partly lands shows what's now stored.
  const editing = screen.lines.find(({ id }) => id === editingId) ?? null;

  return (
    <PageFrame
      title="Transactions"
      subtitle={subtitle}
      action={
        <HeaderMonthControl
          month={month}
          hrefFor={(to) => transactionsHref(to, filters)}
        />
      }>
      {empty?.kind === "month" ? (
        <EmptyMonth title={empty.title} text={empty.text} />
      ) : (
        <>
          <TransactionFiltersBar
            filters={filters}
            accounts={screen.accounts}
            categories={screen.categories}
            onChange={setFilters}
          />
          <MonthRows
            lines={lines}
            empty={empty}
            filters={filters}
            onChange={setFilters}
            onEdit={setEditingId}
          />
          <EditRowDialog
            line={editing}
            categories={screen.categories}
            onClose={() => setEditingId(null)}
          />
        </>
      )}
    </PageFrame>
  );
}

export function TransactionsScreen({
  month,
  screen,
}: {
  month: string;
  screen: TransactionsScreenData | null;
}) {
  if (screen !== null) {
    return <ReadyTransactions month={month} screen={screen} />;
  }

  return (
    <PageFrame
      title="Transactions"
      subtitle=""
      action={<HeaderMonthControl month={month} />}>
      <Notice
        message={{
          tone: "error",
          text: "This month can't be loaded. Reload the page to try again.",
        }}
      />
    </PageFrame>
  );
}
