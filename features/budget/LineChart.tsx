"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ChartColor, ChartLayout } from "./lineChartLayout";

// Whole class names, so Tailwind can find them.
const STROKES: Record<ChartColor, string> = {
  "chart-1": "stroke-chart-1",
  "chart-2": "stroke-chart-2",
  "chart-3": "stroke-chart-3",
  "chart-4": "stroke-chart-4",
  "chart-5": "stroke-chart-5",
};

const FILLS: Record<ChartColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
};

function LineKey({ color }: { color: ChartColor }) {
  return <span className={cn("h-0.5 w-4 shrink-0", FILLS[color])} />;
}

function Tooltip({
  column,
  flipped,
}: {
  column: ChartLayout["columns"][number];
  flipped: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ left: `${column.left}%` }}
      className={cn(
        "pointer-events-none absolute top-1 z-10 w-44 rounded-xl bg-popover px-3 py-2.5 text-body-sm shadow-modal",
        flipped ? "-ml-46" : "ml-2",
      )}>
      <div className="mb-1 font-medium text-ice-highlight">{column.name}</div>
      {column.readouts.map(({ key, label, color, value }) => (
        <div key={key} className="flex items-center gap-2 text-moon-mist">
          <LineKey color={color} />
          <span className="flex-1">{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A plain SVG line chart. Every month is a button, so the tooltip works by hover,
 * keyboard focus and touch alike, and its label holds the same figures.
 */
export function LineChart({
  title,
  layout,
}: {
  title: string;
  layout: ChartLayout;
}) {
  const [active, setActive] = useState<number | null>(null);
  const { columns, endLabels, rangeLabel, series, ticks } = layout;
  const slots = {
    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3 md:px-6">
        <h3 className="text-body-sm font-medium text-moon-mist">{title}</h3>
        <div className="flex flex-wrap items-center gap-4 text-body-sm text-moon-mist">
          {series.map(({ key, label, color }) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <LineKey color={color} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-x-2 px-4 pb-5 md:grid-cols-[48px_minmax(0,1fr)_72px] md:px-6"
        onMouseLeave={() => setActive(null)}>
        <div aria-hidden="true" className="relative hidden md:block">
          {ticks.map(({ top, label }) => (
            <span
              key={label}
              style={{ top: `${top}%` }}
              className="absolute right-0 -translate-y-1/2 text-caption text-muted-foreground tabular-nums">
              {label}
            </span>
          ))}
        </div>

        <div className="relative h-40 md:h-60">
          {ticks.map(({ top, label }) => (
            <div
              key={label}
              style={{ top: `${top}%` }}
              className="absolute inset-x-0 h-px bg-border"
            />
          ))}

          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible">
            {series.map(({ key, color, points }) => (
              <polyline
                key={key}
                points={points}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                className={cn("stroke-2", STROKES[color])}
              />
            ))}
          </svg>

          {series.flatMap(({ key, color, dots }) =>
            dots.map(({ left, top }) => (
              <span
                key={`${key}-${left}`}
                style={{ left: `${left}%`, top: `${top}%` }}
                className={cn(
                  "pointer-events-none absolute -mt-1 -ml-1 size-2 rounded-full ring-2 ring-background",
                  FILLS[color],
                )}
              />
            )),
          )}

          {active !== null && (
            <>
              <div
                style={{ left: `${columns[active].left}%` }}
                className="pointer-events-none absolute inset-y-0 w-px bg-moon-mist/30"
              />
              <Tooltip
                column={columns[active]}
                flipped={active >= columns.length / 2}
              />
            </>
          )}

          <div className="absolute inset-0 grid" style={slots}>
            {columns.map(({ name, description }, index) => (
              <button
                key={name}
                type="button"
                aria-label={description}
                className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(index)}
              />
            ))}
          </div>
        </div>

        <div aria-hidden="true" className="relative hidden md:block">
          {endLabels.map(({ key, label, top }) => (
            <span
              key={key}
              style={{ top: `${top}%` }}
              className="absolute left-0 -translate-y-1/2 text-caption text-moon-mist">
              {label}
            </span>
          ))}
        </div>

        <div
          aria-hidden="true"
          style={slots}
          className="col-start-2 mt-2 hidden text-center text-caption text-muted-foreground md:grid">
          {columns.map(({ name, short }) => (
            <span key={name}>{short}</span>
          ))}
        </div>

        <div
          aria-hidden="true"
          className="mt-2 flex items-center justify-between gap-3 text-caption text-muted-foreground md:hidden">
          <span>{columns[0].name}</span>
          <span>{rangeLabel}</span>
          <span>{columns[columns.length - 1].name}</span>
        </div>
      </div>
    </div>
  );
}
