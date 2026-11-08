import { currencyExponent, formatMoney } from "@/lib/money";

export type ChartColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

/**
 * A month with no figure to plot, shown by its label instead, such as a month
 * whose rows all need review: plotting it as $0 would look like spending stopped.
 */
export type MissingValue = { missing: string };

/** Minor units, or a month with no figure. */
export type ChartValue = number | MissingValue;

export type ChartSeries = {
  key: string;
  label: string;
  color: ChartColor;
  values: readonly ChartValue[];
};

export type ChartColumn = {
  name: string;
  short: string;
  /** Shown under the short name, such as under each January. */
  year?: string;
  /** False leaves the axis blank here, for a range too long to label every month. */
  labelled?: boolean;
};

/** Values are minor units of one currency, on one axis. */
export type ChartInput = {
  columns: readonly ChartColumn[];
  series: readonly ChartSeries[];
  currency: string;
  /** A column to pick out with a band, a larger dot, a bold label and its figure. */
  highlight?: number;
};

export type ChartDot = {
  left: number;
  top: number;
  /** Drawn hollow on the $0 line, with no line to it. */
  missing: boolean;
  highlighted: boolean;
};

/** A figure or label floating above a dot: the highlighted month's, or a missing one's. */
export type ChartTag = {
  key: string;
  left: number;
  top: number;
  text: string;
  /** A phone has no month under each column, so its tag names the month too. */
  phoneText: string;
  missing: boolean;
  /** Past the middle, so a phone's tag sits to the dot's left and stays in the card. */
  flipped: boolean;
};

export type ChartLayout = {
  ticks: { top: number; label: string }[];
  series: {
    key: string;
    label: string;
    color: ChartColor;
    /** One polyline for each run of months with figures, so a missing one breaks it. */
    segments: string[];
    dots: ChartDot[];
  }[];
  columns: {
    name: string;
    short: string;
    year: string | null;
    labelled: boolean;
    highlighted: boolean;
    left: number;
    description: string;
    readouts: {
      key: string;
      label: string;
      color: ChartColor;
      value: string;
    }[];
  }[];
  endLabels: { key: string; label: string; top: number }[];
  rangeLabel: string;
  /** The highlighted column's slot, as percentages of the plot's width. */
  band: { left: number; width: number } | null;
  tags: ChartTag[];
};

const INTERVALS = 3;
const STEP_SIZES = [1, 2, 3, 4, 5, 6, 8, 10];
// The axis turns compact at 10,000 whole units, as in $12k.
const COMPACT_FROM = 10_000;
const THOUSAND = 1_000;
// As a percentage of the plot's height: about one line of label text.
const MIN_LABEL_GAP = 10;

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cleanStep(span: number, unit: number): number {
  const raw = Math.max(span / INTERVALS, unit);
  const power = 10 ** Math.floor(Math.log10(raw));
  const size = STEP_SIZES.find((candidate) => candidate * power >= raw) ?? 10;
  return Math.round(size * power);
}

function formatWhole(minor: number, currency: string): string {
  return formatMoney({ minor, currency }).replace(/\.0+$/, "");
}

/** Ticks are whole thousands once the axis is compact. */
function formatTick(tick: number, currency: string, compact: boolean): string {
  if (!compact || tick === 0) return formatWhole(tick, currency);
  return `${formatWhole(tick / THOUSAND, currency)}k`;
}

function isFigure(value: ChartValue): value is number {
  return typeof value === "number";
}

/** Runs of neighbouring values with figures, as index lists. */
function runs(values: readonly ChartValue[]): number[][] {
  const found: number[][] = [];
  let current: number[] = [];
  values.forEach((value, index) => {
    if (isFigure(value)) {
      current.push(index);
      return;
    }
    if (current.length > 0) found.push(current);
    current = [];
  });
  if (current.length > 0) found.push(current);
  return found;
}

/** Works out the geometry as percentages, so the plot can take any width. */
export function layoutLineChart({
  columns,
  series,
  currency,
  highlight,
}: ChartInput): ChartLayout {
  const unit = 10 ** currencyExponent(currency);
  const values = series.flatMap((line) => line.values.filter(isFigure));
  const highest = Math.max(0, ...values);
  const lowest = Math.min(0, ...values);

  const step = cleanStep(highest - lowest, unit);
  const bottom = Math.floor(lowest / step) * step;
  const top = Math.max(Math.ceil(highest / step) * step, bottom + step);

  const topOf = (value: number) =>
    rounded((1 - (value - bottom) / (top - bottom)) * 100);
  const leftOf = (index: number) =>
    rounded(((index + 0.5) / columns.length) * 100);
  // A month with no figure sits on the $0 line.
  const plotted = (value: ChartValue) => topOf(isFigure(value) ? value : 0);

  const compact = top >= COMPACT_FROM * unit;
  const ticks: ChartLayout["ticks"] = [];
  for (let tick = top; tick >= bottom; tick -= step) {
    ticks.push({
      top: topOf(tick),
      label: formatTick(tick, currency, compact),
    });
  }

  const money = (value: number) => formatMoney({ minor: value, currency });
  const shown = (value: ChartValue) =>
    isFigure(value) ? money(value) : value.missing;

  // Each line's label sits beside its last month with a figure.
  const ends = series.flatMap((line) => {
    const last = line.values.findLast(isFigure);
    return last === undefined
      ? []
      : [{ key: line.key, label: line.label, top: topOf(last) }];
  });
  const collide = ends.some((end, index) =>
    ends
      .slice(index + 1)
      .some((other) => Math.abs(end.top - other.top) < MIN_LABEL_GAP),
  );

  const tags: ChartTag[] = series.flatMap(({ key, values: line }) =>
    line.flatMap((value, index) => {
      if (isFigure(value) && index !== highlight) return [];
      const left = leftOf(index);
      const text = shown(value);
      const { short } = columns[index];
      return [
        {
          key: `${key}-${index}`,
          left,
          top: plotted(value),
          text,
          phoneText: isFigure(value) ? `${short} ${text}` : `${short} · ${text}`,
          missing: !isFigure(value),
          flipped: left > 50,
        },
      ];
    }),
  );

  return {
    ticks,
    series: series.map(({ key, label, color, values: line }) => {
      const dots = line.map((value, index) => ({
        left: leftOf(index),
        top: plotted(value),
        missing: !isFigure(value),
        highlighted: index === highlight,
      }));
      return {
        key,
        label,
        color,
        dots,
        segments: runs(line).map((run) =>
          run.map((index) => `${dots[index].left},${dots[index].top}`).join(" "),
        ),
      };
    }),
    columns: columns.map(({ name, short, year, labelled }, index) => {
      const readouts = series.map(({ key, label, color, values: line }) => ({
        key,
        label,
        color,
        value: shown(line[index]),
      }));
      const parts = series.map(({ label, values: line }) => {
        const value = line[index];
        return isFigure(value)
          ? `${label.toLowerCase()} ${money(value)}`
          : `${label.toLowerCase()} ${value.missing.toLowerCase()}`;
      });
      return {
        name,
        short,
        year: year ?? null,
        labelled: labelled ?? true,
        highlighted: index === highlight,
        left: leftOf(index),
        description: `${name}: ${parts.join(", ")}`,
        readouts,
      };
    }),
    endLabels: collide ? [] : ends,
    rangeLabel: `${ticks[ticks.length - 1].label} to ${ticks[0].label}`,
    band:
      highlight === undefined
        ? null
        : {
            left: rounded((highlight / columns.length) * 100),
            width: rounded(100 / columns.length),
          },
    tags,
  };
}
