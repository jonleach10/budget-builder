import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const LOCAL_HOST = "127.0.0.1:3100";

function fileNameFor(path: string, project: string): string {
  const name = path.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "");
  return `${name || "home"}-${project}.png`;
}

test("a screen, as a picture", async ({ page }, testInfo) => {
  const path = process.env.SANDBOX_SHOT_PATH ?? "/";
  const folder = process.env.SANDBOX_SHOT_DIR ?? "sandbox/.shots";
  const hosts = new Set<string>();

  page.on("request", (request) => hosts.add(new URL(request.url()).host));

  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${LOCAL_HOST}${path.split("?")[0]}`));

  // Next's dev badge floats over rows, and it isn't part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });

  mkdirSync(folder, { recursive: true });
  const file = join(folder, fileNameFor(path, testInfo.project.name));
  await page.screenshot({
    path: file,
    fullPage: process.env.SANDBOX_SHOT_FULL === "yes",
  });
  console.log(file);

  expect([...hosts]).toEqual([LOCAL_HOST]);
});
