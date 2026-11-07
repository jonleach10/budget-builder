import { expect, test } from "@playwright/test";

const LOCAL_HOST = "127.0.0.1:3100";

const SCREENS = [
  ["Overview", "/"],
  ["Budget", "/budget"],
  ["Transactions", "/transactions"],
  ["Review Inbox", "/review"],
  ["Review Inbox, No Merchant", "/review?section=no-merchant"],
  ["Review Inbox, Possible Transfers", "/review?section=transfers"],
  ["Review Inbox, Possible Duplicates", "/review?section=duplicates"],
  ["Import", "/import"],
  ["Rules", "/rules"],
  ["Settings", "/settings"],
] as const;

const WIDTHS = [
  ["a laptop", { width: 1280, height: 800 }],
  ["a phone", { width: 390, height: 844 }],
] as const;

for (const [name, path] of SCREENS) {
  for (const [device, viewport] of WIDTHS) {
    test(`${name} loads on ${device}`, async ({ page }) => {
      const problems: string[] = [];
      const hosts = new Set<string>();

      page.on("pageerror", (error) => problems.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(message.text());
      });
      page.on("request", (request) => hosts.add(new URL(request.url()).host));

      await page.setViewportSize(viewport);
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      expect(problems).toEqual([]);
      expect([...hosts]).toEqual([LOCAL_HOST]);
    });
  }
}
