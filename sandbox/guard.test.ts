import { describe, expect, it } from "vitest";
import {
  assertLocalSupabase,
  assertLoopbackPorts,
  assertNoEnvLocal,
} from "./guard.ts";

describe("assertLocalSupabase", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])(
    "accepts %s",
    (url) => {
      expect(() => assertLocalSupabase(url)).not.toThrow();
    },
  );

  it.each([
    ["a hosted project", "https://abcdefghijklmnop.supabase.co"],
    ["a host that starts like loopback", "http://127.0.0.1.example.com:54321"],
    ["a host that starts like localhost", "http://localhost.example.com:54321"],
    ["loopback as a login name", "http://127.0.0.1@example.com:54321"],
    ["another address on this network", "http://192.168.3.90:54321"],
    ["every address", "http://0.0.0.0:54321"],
    ["a port the sandbox doesn't use", "http://127.0.0.1:443"],
    ["text that isn't a URL", "127.0.0.1"],
    ["no value", undefined],
    ["a blank value", ""],
  ])("refuses %s", (_name, url) => {
    expect(() => assertLocalSupabase(url)).toThrow(/local Supabase/);
  });
});

describe("assertNoEnvLocal", () => {
  it("accepts a folder with no .env.local", () => {
    expect(() => assertNoEnvLocal(["package.json", ".env.example"])).not.toThrow();
  });

  it("refuses a folder with .env.local, because it points at hosted", () => {
    expect(() => assertNoEnvLocal(["package.json", ".env.local"])).toThrow(
      /\.env\.local/,
    );
  });
});

describe("assertLoopbackPorts", () => {
  const onLoopback = [
    "3000/tcp",
    "8001/tcp, 8088/tcp, 127.0.0.1:54321->8000/tcp",
    "127.0.0.1:54322->5432/tcp",
  ].join("\n");

  it("accepts both ports on loopback only", () => {
    expect(() => assertLoopbackPorts(onLoopback)).not.toThrow();
  });

  it("refuses a port open on every address", () => {
    const open = onLoopback.replace(
      "127.0.0.1:54322->5432/tcp",
      "0.0.0.0:54322->5432/tcp, [::]:54322->5432/tcp",
    );

    expect(() => assertLoopbackPorts(open)).toThrow(/54322/);
  });

  it("refuses a port open on IPv6 alone", () => {
    const open = `${onLoopback}, [::]:54322->5432/tcp`;

    expect(() => assertLoopbackPorts(open)).toThrow(/54322/);
  });

  it("refuses when a port isn't published at all", () => {
    expect(() => assertLoopbackPorts("127.0.0.1:54321->8000/tcp")).toThrow(
      /54322/,
    );
  });
});
