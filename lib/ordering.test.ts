import { describe, expect, it } from "vitest";
import { inPositionOrder, isDirection, moveWithin, nextPosition } from "./ordering";

const row = (id: string, position: number) => ({ id, position });

describe("inPositionOrder", () => {
  it("sorts by position without changing the list it's given", () => {
    const rows = [row("b", 2), row("a", 1)];

    expect(inPositionOrder(rows).map(({ id }) => id)).toEqual(["a", "b"]);
    expect(rows[0].id).toBe("b");
  });

  it("breaks ties by id, because position defaults to 0 in the schema", () => {
    const rows = [row("c", 0), row("a", 0), row("b", 0)];

    expect(inPositionOrder(rows).map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });
});

describe("nextPosition", () => {
  it("is 0 for an empty list", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("is one past the highest position, whatever the gaps", () => {
    expect(nextPosition([row("a", 2), row("b", 7), row("c", 4)])).toBe(8);
  });
});

describe("moveWithin", () => {
  it("swaps a row with the one above it", () => {
    const rows = [row("a", 0), row("b", 1), row("c", 2)];

    expect(moveWithin(rows, "b", "up")).toEqual([row("b", 0), row("a", 1)]);
  });

  it("swaps a row with the one below it", () => {
    const rows = [row("a", 0), row("b", 1), row("c", 2)];

    expect(moveWithin(rows, "b", "down")).toEqual([row("c", 1), row("b", 2)]);
  });

  it("still moves a row when every position is tied", () => {
    const rows = [row("a", 0), row("b", 0), row("c", 0)];

    expect(moveWithin(rows, "c", "up")).toEqual([row("c", 1), row("b", 2)]);
  });

  it("closes gaps, so positions can't drift apart over time", () => {
    const rows = [row("a", 3), row("b", 9)];

    expect(moveWithin(rows, "a", "down")).toEqual([row("b", 0), row("a", 1)]);
  });

  it("changes nothing at the top of the list", () => {
    expect(moveWithin([row("a", 0), row("b", 1)], "a", "up")).toEqual([]);
  });

  it("changes nothing at the bottom of the list", () => {
    expect(moveWithin([row("a", 0), row("b", 1)], "b", "down")).toEqual([]);
  });

  it("changes nothing for an unknown id", () => {
    expect(moveWithin([row("a", 0), row("b", 1)], "z", "up")).toEqual([]);
  });
});

describe("isDirection", () => {
  it.each(["up", "down"])("accepts %s", (direction) => {
    expect(isDirection(direction)).toBe(true);
  });

  it.each(["left", "", "UP"])("refuses %j", (direction) => {
    expect(isDirection(direction)).toBe(false);
  });
});
