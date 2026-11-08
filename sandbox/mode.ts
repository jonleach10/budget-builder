/**
 * Which build the sandbox serves on its port. Development is the default, and
 * production is only ever asked for with --prod.
 */

export type ServerMode = "development" | "production";

export function serverModeFrom(
  flags: readonly (string | undefined)[],
): ServerMode {
  return flags.includes("--prod") ? "production" : "development";
}

/**
 * The processes `lsof -t` found listening on the sandbox's port. Each is a
 * whole number above 1, because a stop signals its process group.
 */
export function listenerPidsFrom(lsofOutput: string): number[] {
  return lsofOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map(Number)
    .filter((pid) => pid > 1);
}

/**
 * Whether a `ps -o pid=,pgid=,command=` line shows Next serving a build, as
 * sandbox:prod starts it. Next titles both a built server and the dev server's
 * worker next-server, so the title alone can't tell them apart. sandbox:prod
 * starts the server in a process group of its own, and the dev worker is in
 * `next dev`'s group, so the IDs can. A stop checks this before it signals.
 */
export function isProductionServer(psLine: string): boolean {
  const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(psLine);
  if (match === null) return false;

  const [, pid, groupId, command] = match;
  const isNext = /^next-server\b/.test(command) || /\/next start\b/.test(command);
  return isNext && pid === groupId;
}

/**
 * Flows and screenshots run against whatever holds the port, so each checks
 * first that it's the build that was asked for.
 */
export function assertServerMode(
  requested: ServerMode,
  productionRunning: boolean,
): void {
  if (requested === "production" && !productionRunning) {
    throw new Error(
      "Refused: production mode isn't running. Start it with npm run sandbox:prod.",
    );
  }

  if (requested === "development" && productionRunning) {
    throw new Error(
      "Refused: production mode holds the port. Add --prod, or stop it with Control-C in its terminal.",
    );
  }
}
