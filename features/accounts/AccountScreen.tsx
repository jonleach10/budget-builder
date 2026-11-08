import Link from "next/link";
import { Upload } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmptyPanel } from "@/features/budget/ScreenParts";
import { cn } from "@/lib/utils";
import { AccountPicker } from "./AccountPicker";
import { PeriodControl } from "./PeriodControl";
import type {
  AccountScreenData,
  CategoryLine,
  ReadyAccount,
} from "./accountScreenData";

const GHOST_PILL =
  "h-11 bg-frost-wash text-white shadow-hairline hover:bg-accent md:h-9";

/**
 * Desktop: a table with Category, Amount, Share and Change, then the Total row.
 * Change is plain text, never teal or ember: more spending on one account isn't
 * over budget. A category that dropped to zero is muted.
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
          <tr
            key={line.name}
            data-dropped={line.dropped || undefined}
            className={cn(
              "h-11 border-b border-border",
              line.dropped && "text-muted-foreground",
            )}>
            <th
              scope="row"
              className={cn(
                "text-left font-normal [overflow-wrap:anywhere]",
                !line.dropped && "text-foreground",
              )}>
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

function CategoryItem({
  line,
  total = false,
}: {
  line: Pick<CategoryLine, "name" | "amount" | "share" | "change"> & {
    dropped?: boolean;
  };
  total?: boolean;
}) {
  const muted = line.dropped === true;

  return (
    <li
      data-dropped={muted || undefined}
      className={cn(
        "flex items-start justify-between gap-3 py-3",
        total && "font-medium text-ice-highlight",
        muted && "text-muted-foreground",
      )}>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <div className={total || muted ? undefined : "text-foreground"}>
          {line.name}
        </div>
        <div className="text-caption text-muted-foreground">
          {shareAndChange(line)}
        </div>
      </div>
      <div className={total || muted ? "shrink-0" : "shrink-0 text-moon-mist"}>
        {line.amount}
      </div>
    </li>
  );
}

/** Phone: each category on two lines, with its share and change under its name. */
function CategoryList({ screen }: { screen: ReadyAccount }) {
  return (
    <ul
      aria-label="Spending by category"
      className="divide-y divide-border text-body-sm tabular-nums md:hidden">
      {screen.categories.map((line) => (
        <CategoryItem key={line.name} line={line} />
      ))}
      <CategoryItem line={{ name: "Total", ...screen.total }} total />
    </ul>
  );
}

/**
 * The donut sits beside the list on a desktop, and the Personal and needs-review
 * lines under it, once those are built. The hint names what Change is against.
 */
function CategoryCard({ screen }: { screen: ReadyAccount }) {
  return (
    <section
      aria-labelledby="spending-by-category"
      className="rounded-2xl bg-card px-4 pt-4 pb-2 shadow-glass md:px-6 md:pt-5 md:pb-4">
      <h2
        id="spending-by-category"
        className="text-body font-medium text-ice-highlight">
        Spending by Category
      </h2>
      <p className="mt-0.5 text-caption text-muted-foreground">{screen.hint}</p>
      <div className="mt-2 md:mt-4">
        <CategoryTable screen={screen} />
        <CategoryList screen={screen} />
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
