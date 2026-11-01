import { currencyExponent, formatMoney } from "@/lib/money";

export type ChartColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

export type ChartSeries = {
  key: string;
  label: string;
  color: ChartColor;
  values: readonly number[];
};

/** Values are minor units of one currency, on one axis. */
export type ChartInput = {
  columns: readonly { name: string; short: string }[];
  series: readonly ChartSeries[];
  currency: string;
};

export type ChartLayout = {
  ticks: { top: number; label: string }[];
  series: {
    key: string;
    label: string;
    color: ChartColor;
    points: string;
    dots: { left: number; top: number }[];
  }[];
  columns: {
    name: string;
    short: string;
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

/** Works out the geometry as percentages, so the plot can take any width. */
export function layoutLineChart({
  columns,
  series,
  currency,
}: ChartInput): ChartLayout {
  const unit = 10 ** currencyExponent(currency);
  const values = series.flatMap((line) => line.values);
  const highest = Math.max(0, ...values);
  const lowest = Math.min(0, ...values);

  const step = cleanStep(highest - lowest, unit);
  const bottom = Math.floor(lowest / step) * step;
  const top = Math.max(Math.ceil(highest / step) * step, bottom + step);

  const topOf = (value: number) =>
    rounded((1 - (value - bottom) / (top - bottom)) * 100);
  const leftOf = (index: number) =>
    rounded(((index + 0.5) / columns.length) * 100);

  const compact = top >= COMPACT_FROM * unit;
  const ticks: ChartLayout["ticks"] = [];
  for (let tick = top; tick >= bottom; tick -= step) {
    ticks.push({
      top: topOf(tick),
      label: formatTick(tick, currency, compact),
    });
  }

  const money = (value: number) => formatMoney({ minor: value, currency });

  const ends = series.map((line) => ({
    key: line.key,
    label: line.label,
    top: topOf(line.values[line.values.length - 1]),
  }));
  const collide = ends.some((end, index) =>
    ends
      .slice(index + 1)
      .some((other) => Math.abs(end.top - other.top) < MIN_LABEL_GAP),
  );

  return {
    ticks,
    series: series.map(({ key, label, color, values: line }) => {
      const dots = line.map((value, index) => ({
        left: leftOf(index),
        top: topOf(value),
      }));
      return {
        key,
        label,
        color,
        dots,
        points: dots.map((dot) => `${dot.left},${dot.top}`).join(" "),
      };
    }),
    columns: columns.map(({ name, short }, index) => {
      const readouts = series.map(({ key, label, color, values: line }) => ({
        key,
        label,
        color,
        value: money(line[index]),
      }));
      const parts = readouts.map(
        ({ label, value }) => `${label.toLowerCase()} ${value}`,
      );
      return {
        name,
        short,
        left: leftOf(index),
        description: `${name}: ${parts.join(", ")}`,
        readouts,
      };
    }),
    endLabels: collide ? [] : ends,
    rangeLabel: `${ticks[ticks.length - 1].label} to ${ticks[0].label}`,
  };
}
