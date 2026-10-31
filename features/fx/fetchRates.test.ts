import { describe, expect, it, vi } from "vitest";
import { convertMoney } from "./convertMoney";
import { fetchRates } from "./fetchRates";

function row(date: string, rate: unknown, base = "EUR", quote = "USD") {
  return { date, base, quote, rate };
}

function respondWith(body: unknown, status = 200) {
  return vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify(body), { status }),
  );
}

const RANGE = {
  from: "2026-03-05",
  to: "2026-03-06",
  base: "EUR",
  target: "USD",
};

describe("fetchRates", () => {
  it("returns rates by ISO date as decimal strings", async () => {
    const fetch = respondWith([
      row("2026-03-05", 1.08),
      row("2026-03-06", 1.0925),
    ]);

    await expect(fetchRates({ ...RANGE, fetch })).resolves.toEqual({
      "2026-03-05": "1.08",
      "2026-03-06": "1.0925",
    });
  });

  it("asks the ECB provider for the range, with only dates and codes", async () => {
    const fetch = respondWith([]);

    await fetchRates({ ...RANGE, fetch });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.frankfurter.dev/v2/providers/ecb/rates?from=2026-03-05&to=2026-03-06&base=EUR&quotes=USD",
    );
  });

  it("returns no rates for an empty response", async () => {
    await expect(
      fetchRates({ ...RANGE, fetch: respondWith([]) }),
    ).resolves.toEqual({});
  });

  it("keeps a row dated before the range", async () => {
    // A weekend range comes back with the Friday before it.
    const fetch = respondWith([row("2026-03-06", 1.09)]);

    await expect(
      fetchRates({ ...RANGE, from: "2026-03-07", to: "2026-03-08", fetch }),
    ).resolves.toEqual({ "2026-03-06": "1.09" });
  });

  it.each([
    [1e-7, "0.0000001"],
    [1.5e-7, "0.00000015"],
    [1.5e21, "1500000000000000000000"],
    [5, "5"],
  ])("writes the rate %d as plain decimal text", async (rate, expected) => {
    const fetch = respondWith([row("2026-03-05", rate)]);

    await expect(fetchRates({ ...RANGE, fetch })).resolves.toEqual({
      "2026-03-05": expected,
    });
  });

  it("gives rates that convertMoney accepts", async () => {
    const fetch = respondWith([row("2026-03-05", 1e-7)]);

    const rates = await fetchRates({ ...RANGE, fetch });

    expect(
      convertMoney(
        { minor: 500_000_000, currency: "EUR" },
        rates["2026-03-05"],
        "USD",
      ).minor,
    ).toBe(50);
  });

  it.each([
    [404],
    [422],
    [429],
    [500],
    [503],
  ])("throws request-failed for a %i response", async (status) => {
    const fetch = respondWith({ status, message: "SECRET-BODY" }, status);

    await expect(fetchRates({ ...RANGE, fetch })).rejects.toMatchObject({
      name: "FxError",
      reason: "request-failed",
    });
  });

  it("throws request-failed when the request can't complete", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("SECRET-NETWORK-DETAIL");
    });

    await expect(fetchRates({ ...RANGE, fetch })).rejects.toMatchObject({
      name: "FxError",
      reason: "request-failed",
    });
  });

  it("throws unexpected-response for a body that isn't JSON", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("<html>SECRET-BODY</html>"),
    );

    await expect(fetchRates({ ...RANGE, fetch })).rejects.toMatchObject({
      name: "FxError",
      reason: "unexpected-response",
    });
  });

  it.each([
    ["an object of rates", { rates: { "2026-03-05": { USD: 1.08 } } }],
    ["null", null],
    ["a row that isn't an object", ["SECRET-BODY"]],
    ["a null row", [null]],
    ["a row with no rate", [{ date: "2026-03-05", base: "EUR", quote: "USD" }]],
    ["a row with no date", [{ base: "EUR", quote: "USD", rate: 1.08 }]],
    ["a rate that is a string", [row("2026-03-05", "1.08")]],
    ["a rate of zero", [row("2026-03-05", 0)]],
    ["a negative rate", [row("2026-03-05", -1.08)]],
    ["a date that doesn't exist", [row("2026-02-30", 1.08)]],
    ["a date with a time", [row("2026-03-05T00:00:00Z", 1.08)]],
    ["the wrong base", [row("2026-03-05", 1.08, "GBP", "USD")]],
    ["the wrong quote", [row("2026-03-05", 1.08, "EUR", "GBP")]],
  ])("throws unexpected-response for %s", async (_label, body) => {
    await expect(
      fetchRates({ ...RANGE, fetch: respondWith(body) }),
    ).rejects.toMatchObject({
      name: "FxError",
      reason: "unexpected-response",
    });
  });

  it("throws unexpected-response for a rate too large to be finite", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          '[{"date":"2026-03-05","base":"EUR","quote":"USD","rate":1e999}]',
        ),
    );

    await expect(fetchRates({ ...RANGE, fetch })).rejects.toMatchObject({
      name: "FxError",
      reason: "unexpected-response",
    });
  });

  it.each([
    [
      "a failed response",
      async () =>
        new Response('{"message":"SECRET-BODY"}', { status: 500 }),
    ],
    ["a body that isn't JSON", async () => new Response("SECRET-BODY")],
    ["an unexpected row", async () => new Response('["SECRET-BODY"]')],
    [
      "a thrown network error",
      async () => {
        throw new TypeError("SECRET-BODY");
      },
    ],
  ])("keeps response text out of the error for %s", async (_label, respond) => {
    const fetch = vi.fn<typeof globalThis.fetch>(respond);
    expect.assertions(2);

    try {
      await fetchRates({ ...RANGE, fetch });
    } catch (error) {
      expect(String(error)).not.toMatch(/SECRET/);
      expect(error).not.toHaveProperty("cause");
    }
  });

  it("calls the fetch it's given without a receiver", async () => {
    // A browser's fetch throws when it's called as a method of another object.
    const fetch = respondWith([]);

    await fetchRates({ ...RANGE, fetch });

    expect(fetch.mock.contexts).toEqual([undefined]);
  });

  it.each([
    ["from", { from: "tx-4242" }],
    ["from", { from: "2026-02-30" }],
    ["to", { to: "tx-4242" }],
    ["base", { base: "eur" }],
    ["target", { target: "Groceries" }],
  ])("sends nothing for a bad %s", async (_field, bad) => {
    const fetch = respondWith([]);

    await expect(
      fetchRates({ ...RANGE, ...bad, fetch }),
    ).rejects.toMatchObject({ name: "FxError", reason: "bad-request" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
