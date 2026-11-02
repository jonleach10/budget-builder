import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { assertLoopbackPorts, assertNoEnvLocal } from "./guard.ts";
import { readStatus } from "./status.ts";

/**
 * Runs the local sandbox, from the root of a worktree with no `.env.local`.
 * Every Supabase call goes through `--workdir sandbox`, which has no link to the
 * hosted project, and nothing here calls `link` or `db push`.
 */

const NETWORK = "budget-builder-sandbox";
const SUPABASE = ["supabase@2.122.0", "--workdir", "sandbox", "--network-id", NETWORK];
const VM_SIZE = ["--vm-type", "vz", "--cpu", "2", "--memory", "4", "--disk", "30"];
const LOOPBACK_NETWORK = "com.docker.network.bridge.host_binding_ipv4=127.0.0.1";

function run(
  command: string,
  args: readonly string[],
  env: Record<string, string> = {},
): void {
  execFileSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function outputOf(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function succeeds(command: string, args: readonly string[]): boolean {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

function status() {
  return readStatus(outputOf("npx", [...SUPABASE, "status", "-o", "env"]));
}

function checkPorts(): void {
  assertLoopbackPorts(outputOf("docker", ["ps", "--format", "{{.Ports}}"]));
}

function up(): void {
  if (!succeeds("colima", ["status"])) run("colima", ["start", ...VM_SIZE]);

  // Docker's own default bind doesn't reach this network, so it's set here.
  if (!succeeds("docker", ["network", "inspect", NETWORK])) {
    run("docker", ["network", "create", "--opt", LOOPBACK_NETWORK, NETWORK]);
  }

  run("npx", [...SUPABASE, "start"]);
  checkPorts();
}

function down(): void {
  run("npx", [...SUPABASE, "stop"]);
  run("colima", ["stop"]);
}

function playwright(project: string, env: Record<string, string> = {}): void {
  run(
    "npx",
    ["playwright", "test", "--config", "sandbox/playwright.config.ts", "--project", project],
    env,
  );
}

function seed(): void {
  run("npx", [...SUPABASE, "db", "reset", "--local"]);
  checkPorts();

  const { url, publishableKey, secretKey } = status();
  playwright("seed", {
    SANDBOX_URL: url,
    SANDBOX_PUBLISHABLE_KEY: publishableKey,
    SANDBOX_SECRET_KEY: secretKey,
  });
}

function dev(): void {
  const { url, publishableKey } = status();

  run("npx", ["next", "dev", "-H", "127.0.0.1", "-p", "3100"], {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  });
}

/** One screen by default, because a tall page gets too small to read. */
function shot(path: string | undefined, ...flags: (string | undefined)[]): void {
  if (!path?.startsWith("/")) {
    throw new Error("Give a page path, such as /transactions?month=2026-10.");
  }

  const project = flags.includes("--phone") ? "shot-phone" : "shot-desktop";
  playwright(project, {
    SANDBOX_SHOT_PATH: path,
    SANDBOX_SHOT_FULL: flags.includes("--full") ? "yes" : "",
  });
}

/** Everything from a cold start. Stays running, because the dev server does. */
function start(): void {
  up();
  seed();
  dev();
}

const COMMANDS: Record<string, (...args: (string | undefined)[]) => void> = {
  start,
  up,
  down,
  seed,
  dev,
  shot,
  // Flows save edits, so each run starts from fresh rows.
  flows: () => {
    seed();
    playwright("flows");
  },
};

function main(): void {
  const [name, ...args] = process.argv.slice(2);
  const command = COMMANDS[name];

  if (command === undefined) {
    throw new Error(`Use one of: ${Object.keys(COMMANDS).join(", ")}.`);
  }

  assertNoEnvLocal(readdirSync("."));
  command(...args);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
