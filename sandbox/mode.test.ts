import { describe, expect, it } from "vitest";
import {
  assertServerMode,
  isProductionServer,
  serverModeFrom,
  serverPidFrom,
} from "./mode.ts";

describe("serverModeFrom", () => {
  it("is development when nothing asks for production", () => {
    expect(serverModeFrom([])).toBe("development");
    expect(serverModeFrom(["--phone", "--full", undefined])).toBe("development");
  });

  it("is production when asked with --prod", () => {
    expect(serverModeFrom(["--phone", "--prod"])).toBe("production");
  });
});

describe("assertServerMode", () => {
  it("accepts development when no production server runs", () => {
    expect(() => assertServerMode("development", false)).not.toThrow();
  });

  it("accepts production when the production server runs", () => {
    expect(() => assertServerMode("production", true)).not.toThrow();
  });

  it("refuses production when no production server runs", () => {
    expect(() => assertServerMode("production", false)).toThrow(
      /sandbox:prod/,
    );
  });

  it("refuses development while the production server holds the port", () => {
    expect(() => assertServerMode("development", true)).toThrow(/--prod/);
  });
});

describe("serverPidFrom", () => {
  it("reads the process ID the production server saved", () => {
    expect(serverPidFrom("48213\n")).toBe(48213);
  });

  // A stop signals the ID's whole process group, and 0 or 1 would be this
  // process's own group or every process.
  it.each([
    ["no file", undefined],
    ["an empty file", ""],
    ["text that isn't a number", "next-server"],
    ["zero", "0"],
    ["the first process", "1"],
    ["a negative number", "-48213"],
    ["a fraction", "482.13"],
  ])("finds no ID in %s", (_name, text) => {
    expect(serverPidFrom(text)).toBeNull();
  });
});

// Lines as `ps -o pid=,pgid=,command=` prints them. sandbox:prod starts the
// server in a process group of its own, so its ID and group ID match.
describe("isProductionServer", () => {
  it.each([
    ["once it's serving", "95243 95243 next-server (v16.4.5)"],
    [
      "while it starts",
      "95243 95243 /usr/local/bin/node /repo/node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3100",
    ],
    ["with ps padding the ID", "  952   952 next-server (v16.4.5)"],
  ])("recognizes the production server %s", (_name, line) => {
    expect(isProductionServer(line)).toBe(true);
  });

  it.each([
    ["a process that has ended", ""],
    ["a reused ID", "48213 48213 /usr/bin/ssh-agent -l"],
    [
      "the development server",
      "65246 65233 /usr/local/bin/node /repo/node_modules/.bin/next dev -H 127.0.0.1 -p 3100",
    ],
    // `next dev` forks a worker that Next titles the same as a built server.
    ["the development server's worker", "65247 65233 next-server (v16.4.3)"],
    ["a title with no IDs", "next-server (v16.4.5)"],
  ])("doesn't take %s for it", (_name, line) => {
    expect(isProductionServer(line)).toBe(false);
  });
});
