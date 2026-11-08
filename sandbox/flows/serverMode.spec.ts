import { expect, test } from "@playwright/test";

const LOCAL_HOST = "127.0.0.1:3100";
const MODE = process.env.SANDBOX_MODE ?? "development";

/**
 * The sandbox CLI says which mode it checked for, and this proves the server on
 * the port really is that build, with the fake owner signed in.
 */
test(`Overview loads for the fake owner in ${MODE} mode`, async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(`http://${LOCAL_HOST}/`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Next marks its built scripts immutable only in a production build.
  const script = await page
    .locator('script[src*="/_next/static/"]')
    .first()
    .getAttribute("src");
  expect(script, "the page loads Next's scripts").not.toBeNull();

  const asset = await page.request.get(script ?? "");
  expect(asset.status()).toBe(200);
  const immutable = (asset.headers()["cache-control"] ?? "").includes("immutable");
  expect(immutable, "the scripts are cached as a build's").toBe(
    MODE === "production",
  );
});
