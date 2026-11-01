import type { AuthStage } from "./routeFor";

/** The part of Supabase's auth client this needs, so tests can pass a fake. */
export type AuthReader = {
  getClaims(): Promise<{
    data: { claims: { aal?: string } } | null;
    error: unknown;
  }>;
  getUser(): Promise<{
    data: { user: { factors?: { status: string }[] } | null };
    error: unknown;
  }>;
};

/**
 * Uses getClaims and getUser, which check the session with Supabase. getSession
 * only reads the cookie, so it can't be trusted on the server. Any failure
 * reads as signed out, so an outage can't let anyone in.
 */
export async function readAuthStage(auth: AuthReader): Promise<AuthStage> {
  try {
    const { data, error } = await auth.getClaims();
    if (error || !data) return "signed-out";
    if (data.claims.aal === "aal2") return "signed-in";

    const { data: userData, error: userError } = await auth.getUser();
    if (userError || !userData.user) return "signed-out";

    const hasVerifiedFactor = userData.user.factors?.some(
      (factor) => factor.status === "verified",
    );
    return hasVerifiedFactor ? "needs-mfa-code" : "needs-mfa-setup";
  } catch {
    return "signed-out";
  }
}
