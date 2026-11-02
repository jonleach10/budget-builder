import { assertLocalSupabase } from "./guard.ts";

export type SandboxStatus = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

function valuesIn(text: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of text.split("\n")) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

/** Reads `supabase status -o env`, and refuses anything but the local stack. */
export function readStatus(text: string): SandboxStatus {
  const values = valuesIn(text);

  function required(name: string): string {
    const value = values.get(name);
    if (!value) throw new Error(`The local Supabase status has no ${name}.`);
    return value;
  }

  const url = required("API_URL");
  assertLocalSupabase(url);

  return {
    url,
    publishableKey: required("PUBLISHABLE_KEY"),
    secretKey: required("SECRET_KEY"),
  };
}
