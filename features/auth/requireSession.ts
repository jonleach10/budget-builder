import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readAuthStage } from "./readAuthStage";
import { HOME_PATH, routeFor } from "./routeFor";
import { supabaseEnv } from "./supabaseEnv";

/** Builds a client that acts as the logged-in user, under row-level security. */
export async function serverClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // A page can't set cookies while it renders. The proxy has already
          // refreshed them for this request.
        }
      },
    },
  });
}

/**
 * Next treats the proxy as a routing step, not an access check, so app pages
 * call this as well. Row-level security stays the final check.
 */
export async function requireSession(): Promise<void> {
  const client = await serverClient();
  const target = routeFor(HOME_PATH, await readAuthStage(client.auth));
  if (target !== null) redirect(target);
}
