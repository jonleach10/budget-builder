import type { ReactNode } from "react";
import { Check, TriangleAlert, Upload } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import type {
  OverviewScreenData,
  ReadyOverview,
} from "./overviewScreenData";
import { ScreenControls } from "./ScreenControls";
import { EmptyPanel, InfoNotice, Meter, NoRatePanel, RemainingAmount } from "./ScreenParts";
import type { ScreenParams } from "./screenParams";
import { TrendCard } from "./TrendCard";

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-caption font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-subheading font-medium text-moon-mist">
        {value}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-card p-4 shadow-glass md:p-6", className)}>
      <Figure label={label} value={value} />
      {hint && (
        <div className="mt-1 text-caption text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function BudgetStatus({ screen }: { screen: ReadyOverview }) {
  if (screen.budgetStatus === null) return null;

  const Icon = screen.over ? TriangleAlert : Check;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-body-sm",
        screen.over ? "text-ember-glow" : "text-deep-teal",
      )}>
      <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      {screen.budgetStatus}
    </span>
  );
}

function MonthSummary({ screen }: { screen: ReadyOverview }) {
  return (
    <section aria-label="Month summary" className="grid gap-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-card p-4 shadow-glass md:grid-cols-3 md:gap-x-6 md:gap-y-5 md:p-6">
        <div className="order-3 md:order-1">
          <Figure label="Budgeted" value={screen.budgeted} />
        </div>
        <div className="order-3 md:order-2">
          <Figure label="Spent" value={screen.spent} />
        </div>
        <div className="order-1 col-span-2 md:order-3 md:col-span-1">
          <div className="text-caption font-medium text-muted-foreground">
            Remaining
          </div>
          <div className="mt-1.5 text-[32px] leading-[1.1] font-medium text-ice-highlight">
            <RemainingAmount text={screen.remaining} over={screen.over} />
          </div>
        </div>
        <div className="order-2 col-span-2 flex flex-col gap-2 md:order-4 md:col-span-3">
          <Meter
            percent={screen.used.percent}
            label={screen.used.label}
            over={screen.over}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption text-muted-foreground">
              {screen.used.label}
            </span>
            <BudgetStatus screen={screen} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <Tile label="Income" value={screen.income} />
        <Tile
          label="Net Saved"
          value={screen.netSaved}
          hint="Income less spending"
        />
        <Tile
          label="Money Saved"
          value={screen.moneySaved}
          hint="Brokerage and other savings"
          className="col-span-2 md:col-span-1"
        />
      </div>
    </section>
  );
}

function OverviewBody({ screen }: { screen: OverviewScreenData | null }) {
  if (screen === null) {
    return (
      <Notice
        message={{
          tone: "error",
          text: "This month can't be loaded. Reload the page to try again.",
        }}
      />
    );
  }

  switch (screen.status) {
    case "no-rate":
      return <NoRatePanel message={screen.message} />;
    case "empty":
      return (
        <EmptyPanel
          title={screen.title}
          text={screen.text}
          icon={
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-frost-wash text-foreground shadow-hairline">
              <Upload className="size-6" strokeWidth={1.5} aria-hidden="true" />
            </span>
          }
        />
      );
    case "ready":
      return (
        <>
          <InfoNotice text={screen.review} />
          <MonthSummary screen={screen} />
          <TrendCard layout={screen.trend} />
        </>
      );
  }
}

export function OverviewScreen({
  params,
  screen,
}: {
  params: ScreenParams;
  screen: OverviewScreenData | null;
}) {
  return (
    <PageFrame
      title="Overview"
      subtitle={screen?.subtitle ?? ""}
      action={<ScreenControls path="/" params={params} />}>
      <OverviewBody screen={screen} />
    </PageFrame>
  );
}
