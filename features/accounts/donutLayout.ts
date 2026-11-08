/**
 * A slice's colour goes by its place in the list, not by its category: 1 to 7, or
 * "other" for the hatched Other slice. Only Other is hatched.
 */
export type SliceColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | "other";

/** One slice: its Spending in minor units, and its share as the legend shows it. */
export type DonutSlice = {
  key: string;
  minor: number;
  share: string;
  color: SliceColor;
};

/** Slices in legend order, all above zero, and the figure for the middle. */
export type DonutInput = { slices: readonly DonutSlice[]; total: string };

export type DonutLayout = {
  /** The width and height of the SVG's view box. */
  size: number;
  /** The middle of the ring's stroke, and its width. */
  radius: number;
  stroke: number;
  /** Clockwise from 12 o'clock, in degrees, as drawn. */
  arcs: { key: string; color: SliceColor; from: number; to: number; path: string }[];
  /** A share on its slice, for slices of 8% or more. Dark on the light slots. */
  labels: { key: string; text: string; x: number; y: number; dark: boolean }[];
  /** "Spending" over the figure, centred in the hole. */
  middle: {
    x: number;
    labelY: number;
    total: { text: string; y: number; fontSize: number };
  };
};

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 102;
const STROKE = 36;
// Each slice starts this far after its boundary and ends this far before the next.
const GAP = 0.7;
// A slice smaller than this is still drawn this wide, with its gaps, so it never
// disappears; the largest slice gives up the room.
const MIN_ARC = 1;
const LABEL_FROM = 8;
/**
 * Midnight Glass allows no white text on a tint brighter than 12%, so the solid
 * slots and Other's 75% stripes take dark text. Contrast over the card, white
 * against dark: slot 1 at 100% 1.5 to 13.8, slot 2 at 100% 4.1 to 4.9, slot 3 at
 * 100% 2.7 to 8.4, Other's stripes 4.0 to 5.1. The faint slots keep white, which
 * reads far better there: slot 4 at 50% 4.9 to 4.1, slot 5 at 50% 9.7 to 2.1,
 * slot 6 at 45% 7.9 to 2.6, slot 7 at 30% 13.7 to 1.5.
 */
const DARK_TEXT: readonly SliceColor[] = [1, 2, 3, "other"];

// The middle: "Spending" at 12 units on a 16-unit line, 2 units apart from the figure.
const LABEL_LINE = 16;
const LABEL_GAP = 2;
const FIGURE_LINE = 1.15;
const MAX_FONT = 26;
const MIN_FONT = 14;
// The widest the figure may be, well inside the hole's 168 units.
const FIT_WIDTH = 128;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A point on the ring's middle, clockwise from 12 o'clock. */
function pointAt(degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: rounded(CENTER + RADIUS * Math.sin(radians)),
    y: rounded(CENTER - RADIUS * Math.cos(radians)),
  };
}

function arcPath(from: number, to: number): string {
  // An SVG arc can't close a full circle, so a whole ring is two halves.
  if (to - from >= 360) {
    const top = pointAt(0);
    const bottom = pointAt(180);
    const half = `A${RADIUS} ${RADIUS} 0 1 1`;
    return `M${top.x} ${top.y} ${half} ${bottom.x} ${bottom.y} ${half} ${top.x} ${top.y}`;
  }
  const start = pointAt(from);
  const end = pointAt(to);
  const large = to - from > 180 ? 1 : 0;
  return `M${start.x} ${start.y} A${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x} ${end.y}`;
}

/**
 * About how wide the figure is, in ems: digits and currency signs are tabular, so
 * near enough the same width; separators are narrow.
 */
function figureEms(text: string): number {
  return [...text].reduce(
    (sum, char) => sum + (char === "," || char === "." ? 0.3 : char === "-" ? 0.4 : 0.6),
    0,
  );
}

function middleOf(total: string): DonutLayout["middle"] {
  const fontSize = Math.max(
    MIN_FONT,
    Math.min(MAX_FONT, Math.floor(FIT_WIDTH / figureEms(total))),
  );
  const height = LABEL_LINE + LABEL_GAP + fontSize * FIGURE_LINE;
  const top = CENTER - height / 2;
  return {
    x: CENTER,
    labelY: rounded(top + LABEL_LINE / 2),
    total: {
      text: total,
      y: rounded(top + LABEL_LINE + LABEL_GAP + (fontSize * FIGURE_LINE) / 2),
      fontSize,
    },
  };
}

/**
 * Each slice's angle by its share, except that a slice too small for MIN_ARC and
 * a gap each side gets just that, and the largest slice gives up the difference.
 * So no slice covers another, however small, and the boundaries never cross.
 */
function spansOf(slices: readonly DonutSlice[]): number[] {
  const sum = slices.reduce((all, { minor }) => all + minor, 0);
  const least = MIN_ARC + 2 * GAP;
  const spans = slices.map(({ minor }) => (minor / sum) * 360);
  if (spans.length < 2) return spans;

  const largest = spans.indexOf(Math.max(...spans));
  let owed = 0;
  spans.forEach((span, index) => {
    if (index === largest || span >= least) return;
    owed += least - span;
    spans[index] = least;
  });
  spans[largest] -= owed;
  return spans;
}

/**
 * Works out the ring in a 280 box: each slice an arc in legend order, clockwise
 * from 12 o'clock, its share on it when it's big enough to hold one.
 */
export function layoutDonut({ slices, total }: DonutInput): DonutLayout {
  const sum = slices.reduce((all, { minor }) => all + minor, 0);
  const spans = spansOf(slices);
  const arcs: DonutLayout["arcs"] = [];
  const labels: DonutLayout["labels"] = [];

  let start = 0;
  slices.forEach(({ key, minor, share, color }, index) => {
    const end = start + spans[index];
    const middle = (start + end) / 2;

    if (slices.length === 1) {
      arcs.push({ key, color, from: 0, to: 360, path: arcPath(0, 360) });
    } else {
      const from = start + GAP;
      const to = end - GAP;
      arcs.push({ key, color, from: rounded(from), to: rounded(to), path: arcPath(from, to) });
    }
    start = end;

    if (Math.round((minor / sum) * 100) >= LABEL_FROM) {
      labels.push({ key, text: share, ...pointAt(middle), dark: DARK_TEXT.includes(color) });
    }
  });

  return { size: SIZE, radius: RADIUS, stroke: STROKE, arcs, labels, middle: middleOf(total) };
}
