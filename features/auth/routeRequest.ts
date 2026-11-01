import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readAuthStage, type AuthReader } from "./readAuthStage";
import { routeFor } from "./routeFor";

export type CookieAdapter = {
  getAll(): { name: string; value: string }[];
  setAll(
    cookies: { name: string; value: string; options: CookieOptions }[],
    headers: Record<string, string>,
  ): void;
};

/**
 * Refreshes the session and picks where the request goes. A redirect has to
 * carry the refreshed cookies, or the browser keeps a token that no longer
 * works and the next request reads as logged out.
 */
export async function routeRequest(
  request: NextRequest,
  connect: (cookies: CookieAdapter) => AuthReader,
): Promise<NextResponse> {
  let page = NextResponse.next({ request });
  const cacheHeaders: Record<string, string> = {};

  const auth = connect({
    getAll: () => request.cookies.getAll(),
    setAll(cookies, headers) {
      for (const { name, value } of cookies) request.cookies.set(name, value);
      // The page's own request has to see the new cookies too, which takes a
      // new response built from the updated request.
      page = NextResponse.next({ request });
      for (const { name, value, options } of cookies) {
        page.cookies.set(name, value, options);
      }
      // Supabase only sends these on its first call.
      Object.assign(cacheHeaders, headers);
    },
  });

  const stage = await readAuthStage(auth);
  const target = routeFor(request.nextUrl.pathname, stage);

  let response = page;
  if (target !== null) {
    response = NextResponse.redirect(new URL(target, request.url));
    for (const cookie of page.cookies.getAll()) response.cookies.set(cookie);
  }

  for (const [name, value] of Object.entries(cacheHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}
