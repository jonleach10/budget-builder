"use client";

import { useState } from "react";
import { OutlineButton } from "@/components/ui/action-buttons";
import { LineChart } from "@/features/budget/LineChart";
import { TrendTable } from "@/features/budget/TrendCard";
import type { SpendingTrend } from "./spendingTrend";

/**
 * The Overview's chart, with one line, so the card's title says what it is and
 * the chart needs no title or legend of its own. Show Table gives the same figures.
 */
export function SpendingTrendCard({ trend }: { trend: SpendingTrend }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section
      aria-label="Monthly spending"
      className="overflow-hidden rounded-2xl bg-card shadow-glass">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6 md:py-5">
        <h2 className="text-body font-medium text-ice-highlight">Monthly Spending</h2>
        <OutlineButton onClick={() => setShowTable(!showTable)}>
          {showTable ? "Show Chart" : "Show Table"}
        </OutlineButton>
      </div>
      {trend.hint !== null && (
        <p className="-mt-2 px-4 pb-3 text-caption text-muted-foreground md:-mt-3 md:px-6">
          {trend.hint}
        </p>
      )}
      {showTable ? (
        <TrendTable layout={trend.layout} caption="Spending by month" />
      ) : (
        <LineChart legend={false} layout={trend.layout} />
      )}
    </section>
  );
}
