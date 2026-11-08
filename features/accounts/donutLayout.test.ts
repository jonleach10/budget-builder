import { describe, expect, it } from "vitest";
import { layoutDonut, type DonutSlice, type SliceColor } from "./donutLayout";

const COLORS: SliceColor[] = [1, 2, 3, 4, 5, 6, 7];

/** Slices in minor units, coloured by their place, with shares worked out by hand. */
function slices(...parts: [minor: number, share: string][]): DonutSlice[] {
  return parts.map(([minor, share], index) => ({
    key: `slice-${index + 1}`,
    minor,
    share,
    color: COLORS[index],
  }));
}

describe("layoutDonut", () => {
  it("draws one slice of 100% as a full ring, from two half arcs", () => {
    const layout = layoutDonut({ slices: slices([5000, "100%"]), total: "$50.00" });

    expect(layout.arcs).toEqual([
      {
        key: "slice-1",
        color: 1,
        from: 0,
        to: 360,
        path: "M140 38 A102 102 0 1 1 140 242 A102 102 0 1 1 140 38",
      },
    ]);
    expect(layout.labels).toEqual([
      { key: "slice-1", text: "100%", x: 140, y: 242, dark: true },
    ]);
  });

  it("runs several slices clockwise from 12 o'clock, with a gap of 0.7 degrees each side", () => {
    const layout = layoutDonut({
      slices: slices([7500, "75%"], [2500, "25%"]),
      total: "$100.00",
    });

    // 75% runs from 0 to 270 degrees, so it's drawn from 0.7 to 269.3, a large arc.
    // 25% runs from 270 to 360, so from 270.7 to 359.3.
    expect(layout.arcs).toEqual([
      {
        key: "slice-1",
        color: 1,
        from: 0.7,
        to: 269.3,
        path: "M141.25 38.01 A102 102 0 1 1 38.01 141.25",
      },
      {
        key: "slice-2",
        color: 2,
        from: 270.7,
        to: 359.3,
        path: "M38.01 138.75 A102 102 0 0 1 138.75 38.01",
      },
    ]);
  });

  it("sets the large-arc flag only past 180 degrees", () => {
    const layout = layoutDonut({
      slices: slices([5000, "50%"], [5000, "50%"]),
      total: "$100.00",
    });

    expect(layout.arcs.map(({ path }) => path.split(" ")[5])).toEqual(["0", "0"]);
  });

  it("puts each share at the middle of its slice, on the ring", () => {
    const layout = layoutDonut({
      slices: slices([7500, "75%"], [2500, "25%"]),
      total: "$100.00",
    });

    // At 135 and 315 degrees: 102 x sin 45 is 72.12 from the centre each way.
    expect(layout.labels).toEqual([
      { key: "slice-1", text: "75%", x: 212.12, y: 212.12, dark: true },
      { key: "slice-2", text: "25%", x: 67.88, y: 67.88, dark: false },
    ]);
  });

  it("still draws a tiny slice, 1 degree wide at its middle, with no label", () => {
    const layout = layoutDonut({
      slices: slices([99900, "100%"], [100, "0%"]),
      total: "$1,000.00",
    });

    // 0.1% is 0.36 degrees, from 359.64 to 360, so its middle is 359.82.
    expect(layout.arcs[1]).toMatchObject({ from: 359.32, to: 360.32 });
    expect(layout.labels.map(({ key }) => key)).toEqual(["slice-1"]);
  });

  it("labels slices of 8% or more, and leaves smaller ones to the legend", () => {
    const eight = layoutDonut({
      slices: slices([9200, "92%"], [800, "8%"]),
      total: "$100.00",
    });
    const seven = layoutDonut({
      slices: slices([9300, "93%"], [700, "7%"]),
      total: "$100.00",
    });

    expect(eight.labels.map(({ text }) => text)).toEqual(["92%", "8%"]);
    expect(seven.labels.map(({ text }) => text)).toEqual(["93%"]);
  });

  it("labels a slice that rounds to 8% for the legend too", () => {
    const layout = layoutDonut({
      slices: slices([9250, "93%"], [750, "8%"]),
      total: "$100.00",
    });

    expect(layout.labels.map(({ text }) => text)).toEqual(["93%", "8%"]);
  });

  it("uses dark text on the two light slots and white on the rest", () => {
    const layout = layoutDonut({
      slices: [
        ...slices([2000, "20%"], [2000, "20%"], [2000, "20%"], [2000, "20%"]),
        { key: "other", minor: 2000, share: "20%", color: "other" },
      ],
      total: "$100.00",
    });

    expect(layout.labels.map(({ dark }) => dark)).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("centres Spending over the figure in the hole, at 26 for a usual total", () => {
    const layout = layoutDonut({
      slices: slices([624000, "100%"]),
      total: "$6,240.00",
    });

    // The two lines are 16 + 2 + 29.9 tall, so they start 23.95 above the centre.
    expect(layout.middle).toEqual({
      x: 140,
      labelY: 124.05,
      total: { text: "$6,240.00", y: 149, fontSize: 26 },
    });
  });

  it("shrinks a long figure to fit the hole, and keeps it under the label", () => {
    const layout = layoutDonut({
      slices: slices([12345678, "100%"]),
      total: "€123,456.78",
    });

    expect(layout.middle.total.fontSize).toBe(21);
    expect(layout.middle.total.y).toBeGreaterThan(layout.middle.labelY);
  });

  it("never grows a short figure past 26", () => {
    const layout = layoutDonut({ slices: slices([500, "100%"]), total: "$5.00" });

    expect(layout.middle.total.fontSize).toBe(26);
  });
});
