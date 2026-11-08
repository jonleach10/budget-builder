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

describe("isProductionServer", () => {
  it.each([
    ["once it's serving", "next-server (v16.4.5)"],
    [
      "while it starts",
      "/usr/local/bin/node /repo/node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3100",
    ],
  ])("recognizes the production server %s", (_name, command) => {
    expect(isProductionServer(command)).toBe(true);
  });

  it.each([
    ["a process that has ended", ""],
    ["a reused ID", "/usr/bin/ssh-agent -l"],
    [
      "the development server",
      "/usr/local/bin/node /repo/node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 3100",
    ],
  ])("doesn't take %s for it", (_name, command) => {
    expect(isProductionServer(command)).toBe(false);
  });
});
