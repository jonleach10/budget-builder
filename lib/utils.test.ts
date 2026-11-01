import { describe, it, expect } from "vitest";
import { cn } from "./utils";

const names = [
  "caption",
  "body-sm",
  "body",
  "subheading",
  "heading-sm",
  "heading",
  "heading-lg",
  "display",
];

describe("cn with custom font sizes", () => {
  it.each(names)("keeps text-%s alongside a text color", (name) => {
    expect(cn(`text-${name}`, "text-foreground")).toBe(
      `text-${name} text-foreground`,
    );
  });

  it.each(names.map((name, i) => [name, names[(i + 1) % names.length]]))(
    "text-%s is replaced by a later text-%s",
    (name, other) => {
      expect(cn(`text-${name}`, `text-${other}`)).toBe(`text-${other}`);
    },
  );

  it.each(names)("text-%s overrides an earlier text-sm", (name) => {
    expect(cn("text-sm", `text-${name}`)).toBe(`text-${name}`);
  });
});

describe("cn with custom shadows", () => {
  it.each(["hairline", "hairline-focus", "glass", "modal", "glow"])(
    "shadow-%s overrides an earlier shadow-sm",
    (name) => {
      expect(cn("shadow-sm", `shadow-${name}`)).toBe(`shadow-${name}`);
    },
  );
});
