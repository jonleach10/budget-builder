import { Fragment } from "react";
import Link from "next/link";
import { CircleMinus, Upload } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmptyPanel } from "@/features/budget/ScreenParts";
import { cn } from "@/lib/utils";
import { AccountPicker } from "./AccountPicker";
import { PeriodControl } from "./PeriodControl";
import { SpendingDonut, Swatch } from "./SpendingDonut";
import type {
  AccountScreenData,
  CategoryLine,
  MemberLine,
  NoSpendingLine,
  ReadyAccount,
} from "./accountScreenData";

const GHOST_PILL =
  "h-11 bg-frost-wash text-white shadow-hairline hover:bg-accent md:h-9";

/** The corner that marks a category grouped into Other. */
function IndentMark() {
  return (
    <span
      aria-hidden="true"
      className="-mt-1.5 size-2.5 shrink-0 border-b border-l border-muted-foreground opacity-60"
    />
  );
}

/**
 * Desktop: a table with Category, Amount, Share and Change, then the Total row.
 * Each row's swatch keys it to its slice, in the donut's order, and Other's
 * categories are listed under it. Change is plain text, never teal or ember:
 * more spending on one account isn't over budget. A category at $0 or below is
 * muted, with an empty swatch, because it has no slice.
 */
function CategoryTable({ screen }: { screen: ReadyAccount }) {
  const { showChange } = screen;

  return (
    <table className="hidden w-full table-fixed text-body-sm tabular-nums md:table">
      <caption className="sr-only">Spending by category</caption>
      <thead className="text-caption text-muted-foreground">
        <tr className="border-b border-border">
          <th scope="col" className="pb-2.5 text-left font-medium">
            Category
          </th>
          <th scope="col" className="w-[120px] pb-2.5 text-right font-medium">
            Amount
          </th>
          <th scope="col" className="w-20 pb-2.5 text-right font-medium">
            Share
          </th>
          {showChange && (
            <th scope="col" className="w-20 pb-2.5 text-right font-medium">
              Change
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {screen.categories.map((line) => (
          <Fragment key={line.key}>
            <tr
              data-dropped={line.dropped || undefined}
              className={cn(
                "h-11",
                line.members.length === 0 && "border-b border-border",
                line.dropped && "text-muted-foreground",
              )}>
              <th
                scope="row"
                className={cn(
                  "py-1 pl-5 -indent-5 text-left [overflow-wrap:anywhere]",
                  line.members.length > 0 ? "font-medium" : "font-normal",
                  !line.dropped && "text-foreground",
                )}>
                <span className="mr-2.5 inline-block indent-0">
                  <Swatch color={line.swatch} />
                </span>
                {line.name}
              </th>
              <td className={cn("text-right", !line.dropped && "text-moon-mist")}>
                {line.amount}
              </td>
              <td className={cn("text-right", !line.dropped && "text-foreground")}>
                {line.share}
              </td>
              {showChange && (
                <td className={cn("text-right", !line.dropped && "text-moon-mist")}>
                  {line.change}
                </td>
              )}
            </tr>
            {line.members.map((member, index) => (
              <tr
                key={member.name}
                data-member="true"
                className={cn(
                  "h-9 bg-frost-wash text-muted-foreground",
                  index === line.members.length - 1 && "border-b border-border",
                )}>
                <th
                  scope="row"
                  className="py-1 pl-5 text-left font-normal text-moon-mist [overflow-wrap:anywhere]">
                  <span className="flex items-center gap-2.5">
                    <IndentMark />
                    {/* Read as "Other: Home", so the row says it's part of Other. */}
                    <span className="sr-only">{line.name}: </span>
                    {member.name}
                  </span>
                </th>
                <td className="text-right">{member.amount}</td>
                <td className="text-right">{member.share}</td>
                {showChange && <td className="pr-0 text-right">{member.change}</td>}
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr className="h-11 font-medium text-ice-highlight">
          <th scope="row" className="text-left font-medium">
            Total
          </th>
          <td className="text-right">{screen.total.amount}</td>
          <td className="text-right">{screen.total.share}</td>
          {showChange && <td className="text-right">{screen.total.change}</td>}
        </tr>
      </tfoot>
    </table>
  );
}

/** Share, then Change when there is one, joined by a middle dot. */
function shareAndChange({ share, change }: Pick<CategoryLine, "share" | "change">) {
  return change === null ? share : `${share} · ${change}`;
}

/** A category grouped into Other, under it on a frosted band. */
function MemberItem({ line, group }: { line: MemberLine; group: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 bg-frost-wash py-2 pr-0 pl-5">
      <div className="flex min-w-0 items-center gap-2.5 text-moon-mist [overflow-wrap:anywhere]">
        <IndentMark />
        <span>
          <span className="sr-only">{group}: </span>
          {line.name}
        </span>
      </div>
      <div className="text-right text-muted-foreground">{line.amount}</div>
      <div className="col-span-2 pl-5 text-caption text-muted-foreground">
        {shareAndChange(line)}
      </div>
    </li>
  );
}

function CategoryItem({ line }: { line: CategoryLine }) {
  const { dropped: muted, members } = line;

  return (
    <li data-dropped={muted || undefined}>
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5",
          muted && "text-muted-foreground",
        )}>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2.5 [overflow-wrap:anywhere]",
            !muted && "text-foreground",
            members.length > 0 && "font-medium",
          )}>
          <Swatch color={line.swatch} />
          {line.name}
        </div>
        <div className={muted ? "text-right" : "text-right text-moon-mist"}>
          {line.amount}
        </div>
        <div className="col-span-2 pl-5 text-caption text-muted-foreground">
          {shareAndChange(line)}
        </div>
      </div>
      {members.length > 0 && (
        <ul aria-label={`In ${line.name}`}>
          {members.map((member) => (
            <MemberItem key={member.name} line={member} group={line.name} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Phone: each category on two lines, with its share and change under its name. */
function CategoryList({ screen }: { screen: ReadyAccount }) {
  const { total } = screen;

  return (
    <ul
      aria-label="Spending by category"
      className="divide-y divide-border text-body-sm tabular-nums md:hidden">
      {screen.categories.map((line) => (
        <CategoryItem key={line.key} line={line} />
      ))}
      <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5 font-medium text-ice-highlight">
        <div>Total</div>
        <div className="text-right">{total.amount}</div>
        <div className="col-span-2 text-caption text-muted-foreground">
          {shareAndChange(total)}
        </div>
      </li>
    </ul>
  );
}

/** In the donut's place: no category has Spending above zero in the period. */
function NoSpending({ line }: { line: NoSpendingLine }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-frost-wash p-5 text-body-sm shadow-hairline">
      <CircleMinus
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div>
        <p className="font-medium text-moon-mist">{line.title}</p>
        <p className="mt-0.5 text-caption text-muted-foreground">{line.text}</p>
      </div>
    </div>
  );
}

/**
 * The donut sits beside the list on a desktop and above it on a phone, and the
 * Personal and needs-review lines go under it once those are built. With no
 * Spending, a plain line takes the donut's place, and the list stays only when a
 * category dropped to zero, since it's then the only thing to show.
 */
function CategoryCard({ screen }: { screen: ReadyAccount }) {
  const { chart, noSpending } = screen;
  const listed = screen.categories.length > 0;

  return (
    <section
      aria-labelledby="spending-by-category"
      className="rounded-2xl bg-card px-4 pt-4 pb-2 shadow-glass md:px-6 md:pt-5 md:pb-4">
      <h2
        id="spending-by-category"
        className="text-body font-medium text-ice-highlight">
        Spending by Category
      </h2>
      {listed && (
        <p className="mt-0.5 text-caption text-muted-foreground">{screen.hint}</p>
      )}
      <div
        className={cn(
          "mt-4 mb-2 md:mb-2",
          listed &&
            "grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[296px_minmax(0,1fr)] md:items-start md:gap-8",
        )}>
        <div>
          {chart && <SpendingDonut chart={chart} />}
          {noSpending && <NoSpending line={noSpending} />}
        </div>
        {listed && (
          <div>
            <CategoryTable screen={screen} />
            <CategoryList screen={screen} />
          </div>
        )}
      </div>
    </section>
  );
}

function NoRows({ title, text }: { title: string; text: string }) {
  return (
    <EmptyPanel
      title={title}
      text={text}
      icon={
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-frost-wash text-foreground shadow-hairline">
          <Upload className="size-6" strokeWidth={1.5} aria-hidden="true" />
        </span>
      }>
      <Button asChild variant="ghost" className={GHOST_PILL}>
        <Link href="/import">Go to Import</Link>
      </Button>
    </EmptyPanel>
  );
}

function AccountBody({ screen }: { screen: AccountScreenData | null }) {
  if (screen === null) {
    return (
      <Notice
        message={{
          tone: "error",
          text: "This account can't be loaded. Reload the page to try again.",
        }}
      />
    );
  }

  switch (screen.status) {
    case "no-accounts":
      return <EmptyPanel title={screen.title} text={screen.text} />;
    case "empty":
      return <NoRows title={screen.title} text={screen.text} />;
    case "ready":
      return (
        <>
          <PeriodControl period={screen.period} />
          <CategoryCard screen={screen} />
        </>
      );
  }
}

export function AccountScreen({ screen }: { screen: AccountScreenData | null }) {
  return (
    <PageFrame
      title="Accounts"
      subtitle={screen?.subtitle ?? ""}
      action={screen?.picker && <AccountPicker picker={screen.picker} />}>
      <AccountBody screen={screen} />
    </PageFrame>
  );
}
