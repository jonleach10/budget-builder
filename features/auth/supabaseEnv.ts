/** Called when a client is built, so a build with no values can still finish. */
export function supabaseEnv(): { url: string; key: string } {
  // Next only inlines these for the browser when they're written out in full.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.example.",
    );
  }
  return { url, key };
}
