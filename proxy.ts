import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { routeRequest } from "@/features/auth/routeRequest";
import { supabaseEnv } from "@/features/auth/supabaseEnv";

export function proxy(request: NextRequest) {
  const { url, key } = supabaseEnv();
  return routeRequest(
    request,
    (cookies) => createServerClient(url, key, { cookies }).auth,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
