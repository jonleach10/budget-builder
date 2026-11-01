"use client";

import { useState } from "react";
import { OutlineButton } from "@/components/ui/action-buttons";
import { LineChart } from "./LineChart";
import type { ChartLayout } from "./lineChartLayout";

export function TrendTable({ layout }: { layout: ChartLayout }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-sm">
        <caption className="sr-only">Income and spending by month</caption>
        <thead className="bg-background text-caption text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2.5 pr-2 pl-4 text-left font-medium md:pl-6">
              Month
            </th>
            {layout.series.map(({ key, label }) => (
              <th
                key={key}
                scope="col"
                className="px-2 py-2.5 text-right font-medium last:pr-4 md:last:pr-6">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {layout.columns.map(({ name, readouts }) => (
            <tr key={name} className="border-b border-border last:border-b-0">
              <th
                scope="row"
                className="py-2.5 pr-2 pl-4 text-left font-normal md:pl-6">
                {name}
              </th>
              {readouts.map(({ key, value }) => (
                <td
                  key={key}
                  className="px-2 py-2.5 text-right tabular-nums last:pr-4 md:last:pr-6">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrendCard({ layout }: { layout: ChartLayout }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section
      aria-label="12-month trend"
      className="overflow-hidden rounded-2xl bg-card shadow-glass">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6 md:py-5">
        <h2 className="text-body font-medium text-ice-highlight">
          12-Month Trend
        </h2>
        <OutlineButton onClick={() => setShowTable(!showTable)}>
          {showTable ? "Show Chart" : "Show Table"}
        </OutlineButton>
      </div>
      {showTable ? (
        <TrendTable layout={layout} />
      ) : (
        <LineChart title="Income and Spending" layout={layout} />
      )}
    </section>
  );
}
