import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { assertLoopbackPorts, assertNoEnvLocal } from "./guard.ts";
import {
  assertServerMode,
  isProductionServer,
  serverModeFrom,
  serverPidFrom,
} from "./mode.ts";
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

const HOST = "127.0.0.1";
const PORT = "3100";
const NEXT = "node_modules/next/dist/bin/next";
/** Where production mode keeps its process ID, so a stop from any terminal can find it. */
const PRODUCTION_PID_FILE = "sandbox/.production.pid";
/** The exit code for SIGTERM. */
const STOPPED = 143;

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

/** The production server's process ID, if the one it saved is still that server. */
function productionPid(): number | null {
  if (!existsSync(PRODUCTION_PID_FILE)) return null;

  const pid = serverPidFrom(readFileSync(PRODUCTION_PID_FILE, "utf8"));
  if (pid === null) return null;

  const psLine = spawnSync("ps", ["-p", String(pid), "-o", "pid=,pgid=,command="], {
    encoding: "utf8",
  }).stdout;
  return isProductionServer((psLine ?? "").trim()) ? pid : null;
}

function pause(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Signals the server's whole process group, so no worker keeps the port. */
function signalProduction(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // It has already ended.
  }
}

function stopProduction(): void {
  const pid = productionPid();

  if (pid !== null) {
    console.log("Stopping production mode.");
    signalProduction(pid, "SIGTERM");

    for (let waited = 0; productionPid() !== null && waited < 10_000; waited += 250) {
      pause(250);
    }
    if (productionPid() !== null) signalProduction(pid, "SIGKILL");
  }

  rmSync(PRODUCTION_PID_FILE, { force: true });
}

function down(): void {
  stopProduction();
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

/** The app's settings, read from the local stack, which the guard checks. */
function appEnv(): Record<string, string> {
  const { url, publishableKey } = status();

  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
}

function dev(): void {
  run("npx", ["next", "dev", "-H", HOST, "-p", PORT], appEnv());
}

/**
 * Builds the app and serves the build on the sandbox's port, from a running
 * sandbox. Stays running, like the dev server, until Control-C or sandbox:down.
 */
function prod(): void {
  if (productionPid() !== null || succeeds("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"])) {
    throw new Error(
      `Refused: port ${PORT} is in use. Stop the dev server with Control-C in its terminal first.`,
    );
  }

  checkPorts();
  // The build writes the Supabase settings into the browser code, so it gets them too.
  const env = appEnv();
  run(process.execPath, [NEXT, "build"], env);

  const server = spawn(process.execPath, [NEXT, "start", "-H", HOST, "-p", PORT], {
    stdio: "inherit",
    // Its own process group, so a stop reaches every process it starts.
    detached: true,
    env: { ...process.env, ...env },
  });
  const pid = server.pid;
  if (pid === undefined) throw new Error("The production server didn't start.");

  writeFileSync(PRODUCTION_PID_FILE, String(pid));

  const stop = () => signalProduction(pid, "SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);

  server.on("exit", (code) => {
    rmSync(PRODUCTION_PID_FILE, { force: true });
    // Next exits with 143 when it's stopped, from here or from sandbox:down.
    process.exit(code === null || code === STOPPED ? 0 : code);
  });
}

/** Flows and screenshots use whatever holds the port, so check it's the mode asked for. */
function checkedMode(flags: readonly (string | undefined)[]) {
  const mode = serverModeFrom(flags);
  assertServerMode(mode, productionPid() !== null);
  return mode;
}

/** One screen by default, because a tall page gets too small to read. */
function shot(path: string | undefined, ...flags: (string | undefined)[]): void {
  if (!path?.startsWith("/")) {
    throw new Error("Give a page path, such as /transactions?month=2026-10.");
  }

  checkedMode(flags);
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
  prod,
  shot,
  // Flows save edits, so each run starts from fresh rows.
  flows: (...flags) => {
    const mode = checkedMode(flags);
    seed();
    playwright("flows", { SANDBOX_MODE: mode });
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
