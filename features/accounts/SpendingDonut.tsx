import { cn } from "@/lib/utils";
import type { SpendingChart } from "./accountScreenData";
import type { SliceColor } from "./donutLayout";

const HATCH_ID = "spending-donut-hatch";

// Whole class names, so Tailwind can find them. Three hues, then the same three
// fainter, then a seventh slot. Teal and ember are kept for budget health.
const STROKES: Record<SliceColor, string> = {
  1: "stroke-chart-1",
  2: "stroke-chart-2",
  3: "stroke-chart-5",
  4: "stroke-chart-1/50",
  5: "stroke-chart-2/50",
  6: "stroke-chart-5/45",
  7: "stroke-chart-2/30",
  other: "",
};

const SWATCHES: Record<SliceColor, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-5",
  4: "bg-chart-1/50",
  5: "bg-chart-2/50",
  6: "bg-chart-5/45",
  7: "bg-chart-2/30",
  other:
    "bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--chart-5)_75%,transparent)_0_1.5px,color-mix(in_srgb,var(--chart-5)_16%,transparent)_1.5px_3.5px)]",
};

/** A legend row's key to its slice. A muted row has an empty one. */
export function Swatch({ color }: { color: SliceColor | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-[3px] align-[-1px]",
        color === null ? "ring-1 ring-chart-5/45 ring-inset" : SWATCHES[color],
      )}
    />
  );
}

/**
 * Hand-built SVG from layoutDonut. It's one image to assistive tech, named with
 * the middle figure; the list beside it carries every other figure.
 */
export function SpendingDonut({ chart }: { chart: SpendingChart }) {
  const { size, stroke, arcs, labels, middle } = chart.layout;

  return (
    <div className="mx-auto size-[248px] md:size-[280px]">
      <svg
        role="img"
        aria-label={chart.label}
        viewBox={`0 0 ${size} ${size}`}
        className="size-full overflow-visible">
        <defs>
          <pattern
            id={HATCH_ID}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)">
            <rect width="5" height="5" className="fill-chart-5/16" />
            <rect width="1.6" height="5" className="fill-chart-5/75" />
          </pattern>
        </defs>
        <g fill="none" strokeWidth={stroke}>
          {arcs.map(({ key, color, path }) => (
            <path
              key={key}
              d={path}
              data-slice={color}
              stroke={color === "other" ? `url(#${HATCH_ID})` : undefined}
              className={STROKES[color]}
            />
          ))}
        </g>
        <g
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[11px] font-semibold tabular-nums">
          {labels.map(({ key, text, x, y, dark }) => (
            <text
              key={key}
              x={x}
              y={y}
              className={dark ? "fill-background" : "fill-white"}>
              {text}
            </text>
          ))}
        </g>
        <g textAnchor="middle" dominantBaseline="central">
          <text
            x={middle.x}
            y={middle.labelY}
            className="fill-muted-foreground text-caption">
            Spending
          </text>
          <text
            x={middle.x}
            y={middle.total.y}
            fontSize={middle.total.fontSize}
            className="fill-ice-highlight font-medium tabular-nums">
            {middle.total.text}
          </text>
        </g>
      </svg>
    </div>
  );
}
