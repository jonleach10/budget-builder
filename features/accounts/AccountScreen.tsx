import { Fragment } from "react";
import Link from "next/link";
import { Check, CircleMinus, Inbox, Info, Upload, User } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmptyPanel } from "@/features/budget/ScreenParts";
import { cn } from "@/lib/utils";
import { AccountPicker } from "./AccountPicker";
import { PeriodControl } from "./PeriodControl";
import { SpendingDonut, Swatch } from "./SpendingDonut";
import { SpendingTrendCard } from "./SpendingTrendCard";
import type {
  AccountScreenData,
  AllNeedReviewPanel,
  CategoryLine,
  MemberLine,
  MerchantList,
  NoSpendingLine,
  ReadyAccount,
  ReviewLine,
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
 * In place of the donut and the list: the period has rows, and every one needs
 * review. The signal-blue edge means information, not an error.
 */
function AllNeedReview({ panel }: { panel: AllNeedReviewPanel }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-frost-wash px-4 py-7 text-center shadow-hairline ring-1 ring-signal-blue/35 ring-inset md:px-6 md:py-10">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-frost-wash text-signal-blue shadow-hairline">
        <Inbox className="size-6" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h3 className="text-body font-medium text-ice-highlight">{panel.title}</h3>
      <p className="max-w-[440px] text-body-sm text-moon-mist">{panel.text}</p>
      <Button asChild variant="ghost" className={cn(GHOST_PILL, "w-full md:w-auto")}>
        <Link href={panel.href}>Go to Review Inbox</Link>
      </Button>
    </div>
  );
}

function PersonalItem({ amount }: { amount: string }) {
  return (
    <div className="flex flex-1 items-start gap-2.5 px-3.5 py-3">
      <User
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3 font-medium text-moon-mist">
          <span>Personal</span>
          <span className="tabular-nums">{amount}</span>
        </p>
        <p className="mt-0.5 text-caption text-muted-foreground">
          Personal rows aren&apos;t in Spending.
        </p>
      </div>
    </div>
  );
}

/** Links to the Review inbox while there's something in it, as on the Overview. */
function ReviewItem({ line }: { line: ReviewLine }) {
  return (
    <div className="flex flex-1 items-start gap-2.5 px-3.5 py-3">
      {line.href === null ? (
        <>
          <Check
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-moon-mist">{line.text}</span>
        </>
      ) : (
        <>
          <Info
            className="mt-0.5 size-4 shrink-0 text-signal-blue"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <Link
            href={line.href}
            className="rounded-sm text-foreground underline underline-offset-2 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring">
            {line.text}
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * Personal and the needs-review line, kept apart from Spending. A desktop shows
 * them inside the card, under the donut or, with no list, side by side under the
 * line that replaces it. A phone shows them after the card. With every row in
 * review, the panel is the needs-review line, so only Personal is left here.
 */
function SideLines({
  screen,
  place,
  across = false,
}: {
  screen: ReadyAccount;
  place: "desktop" | "phone";
  across?: boolean;
}) {
  return (
    <div
      data-side-lines={place}
      className={cn(
        "flex-col divide-y divide-border rounded-xl bg-frost-wash text-body-sm shadow-hairline",
        place === "desktop" ? "hidden md:flex" : "flex md:hidden",
        across && "md:flex-row md:divide-x md:divide-y-0",
      )}>
      <PersonalItem amount={screen.personal} />
      {screen.allNeedReview === null && <ReviewItem line={screen.review} />}
    </div>
  );
}

/**
 * The donut sits beside the list on a desktop and above it on a phone, with the
 * Personal and needs-review lines under it. With no Spending, a plain line takes
 * the donut's place, and the list stays only when a category dropped to zero,
 * since it's then the only thing to show. With every row in review, a panel takes
 * the place of both.
 */
function CategoryCard({ screen }: { screen: ReadyAccount }) {
  const { chart, noSpending, allNeedReview } = screen;
  const listed = screen.categories.length > 0;

  return (
    <>
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
          <div className="flex flex-col gap-4 md:gap-6">
            {chart && <SpendingDonut chart={chart} />}
            {noSpending && <NoSpending line={noSpending} />}
            {allNeedReview && <AllNeedReview panel={allNeedReview} />}
            <SideLines
              screen={screen}
              place="desktop"
              across={!listed && allNeedReview === null}
            />
          </div>
          {listed && (
            <div>
              <CategoryTable screen={screen} />
              <CategoryList screen={screen} />
            </div>
          )}
        </div>
      </section>
      <SideLines screen={screen} place="phone" />
    </>
  );
}

/**
 * Desktop: a table with rank, Merchant, Visits and Total. Phone: each merchant on
 * two lines, with its visits under its name. No Merchant is muted, like a missing
 * value, and ranks like any merchant. A long name is cut, with the whole of it in
 * a tooltip.
 */
function MerchantsCard({ list }: { list: MerchantList }) {
  return (
    <section
      aria-labelledby="top-merchants"
      className="overflow-hidden rounded-2xl bg-card pb-1 shadow-glass">
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-5 md:pb-3.5">
        <h2 id="top-merchants" className="text-body font-medium text-ice-highlight">
          Top Merchants
        </h2>
        {list.hint && (
          <p className="mt-0.5 text-caption text-muted-foreground">{list.hint}</p>
        )}
      </div>
      {list.empty !== null ? (
        <p className="px-4 pb-4 text-body-sm text-moon-mist md:px-6 md:pb-5">
          {list.empty}
        </p>
      ) : (
        <>
          <table className="hidden w-full table-fixed text-body-sm tabular-nums md:table">
            <caption className="sr-only">Top merchants</caption>
            <thead className="bg-background text-caption text-muted-foreground">
              <tr className="border-y border-border">
                <th scope="col" className="w-[68px] py-2.5 pl-6 text-left font-medium">
                  <span className="sr-only">Rank</span>
                </th>
                <th scope="col" className="py-2.5 text-left font-medium">
                  Merchant
                </th>
                <th scope="col" className="w-28 py-2.5 text-right font-medium">
                  Visits
                </th>
                <th scope="col" className="w-[176px] py-2.5 pr-6 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {list.lines.map((line) => (
                <tr
                  key={line.key}
                  data-no-merchant={line.noMerchant || undefined}
                  className="h-11 border-b border-border last:border-b-0">
                  <td className="pl-6 text-caption text-muted-foreground">{line.rank}</td>
                  <th
                    scope="row"
                    title={line.name}
                    className={cn(
                      "truncate text-left font-normal",
                      line.noMerchant ? "text-muted-foreground" : "text-foreground",
                    )}>
                    {line.name}
                  </th>
                  <td className="text-right text-moon-mist">{line.visits}</td>
                  <td className="pr-6 text-right text-foreground">{line.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ol aria-label="Top merchants" className="text-body-sm tabular-nums md:hidden">
            {list.lines.map((line) => (
              <li
                key={line.key}
                data-no-merchant={line.noMerchant || undefined}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-border px-4 py-2.5">
                <span
                  title={line.name}
                  className={cn(
                    "truncate",
                    line.noMerchant ? "text-muted-foreground" : "text-foreground",
                  )}>
                  {line.name}
                </span>
                <span className="text-right text-foreground">{line.total}</span>
                <span className="col-span-2 text-caption text-muted-foreground">
                  {line.visitsText}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
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
          {screen.trend && <SpendingTrendCard trend={screen.trend} />}
          <MerchantsCard list={screen.merchants} />
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
