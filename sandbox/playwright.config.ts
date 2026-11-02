import { defineConfig, devices } from "@playwright/test";

const SESSION_FILE = "sandbox/.session.json";

const signedIn = (device: keyof typeof devices) => ({
  dependencies: ["sign-in"],
  use: { ...devices[device], storageState: SESSION_FILE },
});

export default defineConfig({
  testDir: ".",
  outputDir: ".results",
  workers: 1,
  reporter: "line",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3100" },
  projects: [
    { name: "seed", testMatch: "seed.setup.ts" },
    {
      name: "sign-in",
      testMatch: "signIn.setup.ts",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "shot-desktop",
      testMatch: "shot.spec.ts",
      ...signedIn("Desktop Safari"),
    },
    { name: "shot-phone", testMatch: "shot.spec.ts", ...signedIn("iPhone 15") },
    {
      name: "flows",
      testMatch: "flows/*.spec.ts",
      ...signedIn("Desktop Safari"),
    },
  ],
});
