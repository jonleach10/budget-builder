import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import type { AuthReader } from "./readAuthStage";
import { routeRequest, type CookieAdapter } from "./routeRequest";

const REFRESHED = [
  { name: "sb-session", value: "fresh", options: { path: "/" } },
];
const CACHE_HEADERS = { "cache-control": "private, no-store" };

function authFor(aal: string | null, refresh: () => void): AuthReader {
  return {
    getClaims: async () => {
      refresh();
      return {
        data: aal === null ? null : { claims: { aal } },
        error: null,
      };
    },
    getUser: async () => ({ data: { user: { factors: [] } }, error: null }),
  };
}

function connectAs(aal: string | null, refreshes = false) {
  return (cookies: CookieAdapter): AuthReader =>
    authFor(aal, () => {
      if (refreshes) cookies.setAll(REFRESHED, CACHE_HEADERS);
    });
}

function requestFor(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie: "sb-session=stale" },
  });
}

describe("routeRequest", () => {
  it("redirects a logged-out request to the login page", async () => {
    const response = await routeRequest(requestFor("/"), connectAs(null));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("redirects a password-only session to setup", async () => {
    const response = await routeRequest(requestFor("/"), connectAs("aal1"));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login/mfa/setup",
    );
  });

  it("lets a full session through", async () => {
    const response = await routeRequest(requestFor("/"), connectAs("aal2"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("gives the cookie adapter the request's cookies", async () => {
    let seen: { name: string; value: string }[] = [];
    await routeRequest(requestFor("/"), (cookies) => {
      seen = cookies.getAll();
      return authFor("aal2", () => {});
    });

    expect(seen).toEqual([{ name: "sb-session", value: "stale" }]);
  });

  it("keeps a refreshed session on a page that loads", async () => {
    const response = await routeRequest(
      requestFor("/"),
      connectAs("aal2", true),
    );

    expect(response.cookies.get("sb-session")?.value).toBe("fresh");
  });

  it("passes a refreshed session on to the page's own request", async () => {
    const response = await routeRequest(
      requestFor("/"),
      connectAs("aal2", true),
    );

    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-session=fresh",
    );
  });

  it("keeps a refreshed session through a redirect", async () => {
    const response = await routeRequest(
      requestFor("/login"),
      connectAs("aal2", true),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(response.cookies.get("sb-session")?.value).toBe("fresh");
  });

  it.each([
    ["a page that loads", "/", "aal2"],
    ["a redirect", "/login", "aal2"],
  ])("sends the cache headers on %s", async (_name, path, aal) => {
    const response = await routeRequest(
      requestFor(path),
      connectAs(aal, true),
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
