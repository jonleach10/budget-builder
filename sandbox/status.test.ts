import { describe, expect, it } from "vitest";
import { readStatus } from "./status.ts";

const STATUS = [
  'ANON_KEY="anon"',
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'PUBLISHABLE_KEY="sb_publishable_example"',
  'SECRET_KEY="sb_secret_example"',
].join("\n");

describe("readStatus", () => {
  it("reads the three values the sandbox uses", () => {
    expect(readStatus(STATUS)).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_example",
      secretKey: "sb_secret_example",
    });
  });

  it("skips the CLI's other lines", () => {
    const noisy = `Stopped services: [a b]\n${STATUS}\nA new version is available`;

    expect(readStatus(noisy).url).toBe("http://127.0.0.1:54321");
  });

  it("refuses a status that doesn't point at the local Supabase", () => {
    const hosted = STATUS.replace(
      "http://127.0.0.1:54321",
      "https://abcdefghijklmnop.supabase.co",
    );

    expect(() => readStatus(hosted)).toThrow(/local Supabase/);
  });

  it("refuses a status with a value missing", () => {
    const missing = STATUS.replace('SECRET_KEY="sb_secret_example"', "");

    expect(() => readStatus(missing)).toThrow(/SECRET_KEY/);
  });

  it("names no key's value when it refuses", () => {
    const missing = STATUS.replace('SECRET_KEY="sb_secret_example"', "");

    expect(() => readStatus(missing)).not.toThrow(/sb_publishable_example/);
  });
});
