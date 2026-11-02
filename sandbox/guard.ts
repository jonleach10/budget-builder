/**
 * What keeps the sandbox away from real data. Hosted holds JL's real rows, and
 * Claude may only ever look at the app through the sandbox, so each check fails
 * closed and runs before anything starts.
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const API_PORT = "54321";
const DATABASE_PORT = "54322";

/** The address and port of each published mapping, as `docker ps` prints them. */
const PUBLISHED = /(\[[^\]]*\]|\d+\.\d+\.\d+\.\d+):(\d+)->/g;

function parsedUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function assertLocalSupabase(url: string | undefined): void {
  const parsed = parsedUrl(url ?? "");

  if (
    parsed === null ||
    parsed.protocol !== "http:" ||
    !LOCAL_HOSTS.has(parsed.hostname) ||
    parsed.port !== API_PORT
  ) {
    throw new Error("Refused: this URL isn't the local Supabase.");
  }
}

export function assertNoEnvLocal(fileNames: readonly string[]): void {
  if (fileNames.includes(".env.local")) {
    throw new Error(
      "Refused: this folder has .env.local, which points at hosted. Run the sandbox from its own worktree.",
    );
  }
}

/** A database with a default login can't be open to the local network. */
export function assertLoopbackPorts(dockerPorts: string): void {
  const published = [...dockerPorts.matchAll(PUBLISHED)];

  for (const port of [API_PORT, DATABASE_PORT]) {
    const addresses = published
      .filter((match) => match[2] === port)
      .map((match) => match[1]);

    if (
      addresses.length === 0 ||
      addresses.some((address) => address !== "127.0.0.1")
    ) {
      throw new Error(`Refused: port ${port} isn't on loopback only.`);
    }
  }
}
