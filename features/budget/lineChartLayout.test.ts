import { describe, expect, it } from "vitest";
import { layoutLineChart, type ChartInput } from "./lineChartLayout";

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
      { left: 25, top: 0 },
      { left: 75, top: 50 },
    ]);
    expect(layout.series[0].points).toBe("25,0 75,50");
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
