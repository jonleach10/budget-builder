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

/** A whole positive number above 1, because a stop signals its process group. */
export function serverPidFrom(text: string | undefined): number | null {
  const trimmed = text?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) return null;

  const pid = Number(trimmed);
  return pid > 1 ? pid : null;
}

/**
 * Whether `ps -o command=` shows Next serving a build. Next renames its process
 * to next-server once it starts. An ID can be reused once a process ends, so a
 * stop checks this before it signals anything.
 */
export function isProductionServer(command: string): boolean {
  return /^next-server\b/.test(command) || /\/next start\b/.test(command);
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
