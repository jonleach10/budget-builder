import { describe, expect, it } from "vitest";
import {
  layoutLineChart,
  type ChartInput,
  type ChartValue,
} from "./lineChartLayout";

function chart(
  first: readonly number[],
  second: readonly number[],
  currency = "USD",
): ChartInput {
  return {
    columns: first.map((_, index) => ({
      name: `Month ${index + 1}`,
      short: `M${index + 1}`,
    })),
    series: [
      { key: "income", label: "Income", color: "chart-1", values: first },
      { key: "spending", label: "Spending", color: "chart-2", values: second },
    ],
    currency,
  };
}

describe("layoutLineChart", () => {
  it("rounds the axis up to clean, compact ticks once it reaches $10,000", () => {
    const layout = layoutLineChart(chart([985000, 1135000], [712000, 894000]));

    expect(layout.ticks.map(({ label }) => label)).toEqual([
      "$12k",
      "$8k",
      "$4k",
      "$0",
    ]);
  });

  it("shows ticks in full below $10,000", () => {
    const layout = layoutLineChart(chart([340000, 395000], [221000, 264000], "EUR"));

    expect(layout.ticks.map(({ label }) => label)).toEqual([
      "€4,000",
      "€2,000",
      "€0",
    ]);
  });

  it("places ticks from the top of the plot to the bottom", () => {
    const layout = layoutLineChart(chart([1135000], [0]));

    expect(layout.ticks.map(({ top }) => top)).toEqual([
      0,
      33.333,
      66.667,
      100,
    ]);
  });

  it("extends the axis below zero when refunds pass spending", () => {
    const layout = layoutLineChart(chart([300000], [-50000]));

    expect(layout.ticks.map(({ label }) => label)).toEqual([
      "$4,000",
      "$2,000",
      "$0",
      "-$2,000",
    ]);
  });

  it("gives a usable axis when every value is zero", () => {
    const layout = layoutLineChart(chart([0, 0], [0, 0]));

    expect(layout.ticks.length).toBeGreaterThan(1);
    expect(layout.series[0].dots.every(({ top }) => top === 100)).toBe(true);
  });

  it("centers each month in its slot", () => {
    const layout = layoutLineChart(chart([1, 1, 1, 1], [1, 1, 1, 1]));

    expect(layout.columns.map(({ left }) => left)).toEqual([
      12.5, 37.5, 62.5, 87.5,
    ]);
  });

  it("plots a value by its share of the axis", () => {
    const layout = layoutLineChart(chart([1200000, 600000], [0, 0]));

    expect(layout.series[0].dots).toEqual([
      { left: 25, top: 0, missing: false, highlighted: false },
      { left: 75, top: 50, missing: false, highlighted: false },
    ]);
    expect(layout.series[0].segments).toEqual(["25,0 75,50"]);
  });

  it("gives every month a readout of every series, formatted", () => {
    const layout = layoutLineChart(chart([985000], [743461]));

    expect(layout.columns[0].readouts).toEqual([
      { key: "income", label: "Income", color: "chart-1", value: "$9,850.00" },
      {
        key: "spending",
        label: "Spending",
        color: "chart-2",
        value: "$7,434.61",
      },
    ]);
  });

  it("names a month's values for anyone who can't see the chart", () => {
    const layout = layoutLineChart(chart([985000], [743461]));

    expect(layout.columns[0].description).toBe(
      "Month 1: income $9,850.00, spending $7,434.61",
    );
  });

  it("shows end labels when the lines end apart", () => {
    const layout = layoutLineChart(chart([1200000], [300000]));

    expect(layout.endLabels).toEqual([
      { key: "income", label: "Income", top: 0 },
      { key: "spending", label: "Spending", top: 75 },
    ]);
  });

  it("drops end labels that would collide, leaving the legend and tooltip", () => {
    const layout = layoutLineChart(chart([1200000], [1190000]));

    expect(layout.endLabels).toEqual([]);
  });

  it("gives the range for a screen too narrow for the axis", () => {
    const layout = layoutLineChart(chart([985000, 1135000], [712000, 894000]));

    expect(layout.rangeLabel).toBe("$0 to $12k");
  });

  it("works for a third series, so it can serve a second chart", () => {
    const input = chart([100000], [200000]);
    const layout = layoutLineChart({
      ...input,
      series: [
        ...input.series,
        { key: "other", label: "Other", color: "chart-3", values: [300000] },
      ],
    });

    expect(layout.series.map(({ key }) => key)).toEqual([
      "income",
      "spending",
      "other",
    ]);
  });
});

const REVIEW = { missing: "Needs Review" };

/** One Spending line, as the Account page draws it, over Aug to Nov 2026. */
function spending(
  values: readonly ChartValue[],
  extra: Partial<ChartInput> = {},
): ChartInput {
  const months = ["Aug", "Sep", "Oct", "Nov"];
  return {
    columns: values.map((_, index) => ({
      name: `${months[index]} 2026`,
      short: months[index],
    })),
    series: [{ key: "spending", label: "Spending", color: "chart-2", values }],
    currency: "USD",
    ...extra,
  };
}

describe("layoutLineChart: a point with no figure", () => {
  it("puts it hollow on the $0 line, and breaks the line on both sides of it", () => {
    const layout = layoutLineChart(spending([300000, 150000, REVIEW, 300000]));

    expect(layout.series[0].dots).toEqual([
      { left: 12.5, top: 0, missing: false, highlighted: false },
      { left: 37.5, top: 50, missing: false, highlighted: false },
      { left: 62.5, top: 100, missing: true, highlighted: false },
      { left: 87.5, top: 0, missing: false, highlighted: false },
    ]);
    expect(layout.series[0].segments).toEqual(["12.5,0 37.5,50", "87.5,0"]);
  });

  it("sits on the $0 line even when refunds take the axis below it", () => {
    const layout = layoutLineChart(spending([300000, -100000, REVIEW]));

    // The axis runs from -$2,000 to $4,000, so $0 is a third of the way up.
    expect(layout.series[0].dots[2].top).toBe(66.667);
    expect(layout.ticks.find(({ label }) => label === "$0")?.top).toBe(66.667);
  });

  it("gives it its label in the tooltip, the table and the month's description", () => {
    const layout = layoutLineChart(spending([300000, REVIEW]));

    expect(layout.columns[1].readouts[0].value).toBe("Needs Review");
    expect(layout.columns[1].description).toBe("Sep 2026: spending needs review");
  });

  it("has no tag unless it's the highlighted month, so neighbouring tags can't crowd", () => {
    const layout = layoutLineChart(spending([300000, REVIEW, REVIEW, 300000]));

    expect(layout.tags).toEqual([]);
    expect(layout.series[0].dots.filter(({ missing }) => missing)).toHaveLength(2);
  });

  it("puts the end label at the last month with a figure", () => {
    const layout = layoutLineChart(spending([300000, 150000, REVIEW]));

    expect(layout.endLabels).toEqual([{ key: "spending", label: "Spending", top: 50 }]);
  });

  it("has no end label when no month has a figure", () => {
    const layout = layoutLineChart(spending([REVIEW, REVIEW]));

    expect(layout.endLabels).toEqual([]);
    expect(layout.series[0].segments).toEqual([]);
    expect(layout.ticks.length).toBeGreaterThan(1);
  });
});

describe("layoutLineChart: a highlighted month", () => {
  it("marks its column, its dot and a band the width of its slot", () => {
    const layout = layoutLineChart(spending([100000, 200000, 300000, 150000], { highlight: 3 }));

    expect(layout.columns.map(({ highlighted }) => highlighted)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(layout.series[0].dots[3].highlighted).toBe(true);
    expect(layout.band).toEqual({ left: 75, width: 25 });
  });

  it("tags it with its figure, and its month too for a phone, on the left near the end", () => {
    const layout = layoutLineChart(
      spending([100000, 200000, 300000, 263050], { highlight: 3 }),
    );

    expect(layout.tags).toEqual([
      {
        key: "spending-3",
        left: 87.5,
        top: layout.series[0].dots[3].top,
        text: "$2,630.50",
        phoneText: "Nov $2,630.50",
        missing: false,
        flipped: true,
      },
    ]);
  });

  it("tags a highlighted month with no figure with its label, and its month for a phone", () => {
    const layout = layoutLineChart(spending([100000, REVIEW], { highlight: 1 }));

    expect(layout.tags).toEqual([
      {
        key: "spending-1",
        left: 75,
        top: 100,
        text: "Needs Review",
        phoneText: "Sep · Needs Review",
        missing: true,
        flipped: true,
      },
    ]);
    expect(layout.series[0].dots[1]).toMatchObject({ missing: true, highlighted: true });
  });

  it("tags only the highlighted month when other months have no figure too", () => {
    const layout = layoutLineChart(
      spending([REVIEW, REVIEW, 100000, REVIEW], { highlight: 3 }),
    );

    expect(layout.tags.map(({ key, text }) => ({ key, text }))).toEqual([
      { key: "spending-3", text: "Needs Review" },
    ]);
  });

  it("has no band or tag when no month is highlighted", () => {
    const layout = layoutLineChart(spending([100000, 200000]));

    expect(layout.band).toBeNull();
    expect(layout.tags).toEqual([]);
  });
});

describe("layoutLineChart: the month labels", () => {
  it("labels every month and shows no year unless asked", () => {
    const layout = layoutLineChart(spending([1, 2]));

    expect(
      layout.columns.map(({ short, year, labelled }) => ({ short, year, labelled })),
    ).toEqual([
      { short: "Aug", year: null, labelled: true },
      { short: "Sep", year: null, labelled: true },
    ]);
  });

  it("passes a year and an unlabelled month through", () => {
    const layout = layoutLineChart({
      ...spending([1, 2]),
      columns: [
        { name: "Dec 2025", short: "Dec", year: "2025" },
        { name: "Jan 2026", short: "Jan", labelled: false },
      ],
    });

    expect(
      layout.columns.map(({ short, year, labelled }) => ({ short, year, labelled })),
    ).toEqual([
      { short: "Dec", year: "2025", labelled: true },
      { short: "Jan", year: null, labelled: false },
    ]);
  });
});
