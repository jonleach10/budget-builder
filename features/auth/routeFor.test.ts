import { describe, expect, it } from "vitest";
import { routeFor } from "./routeFor";

describe("routeFor", () => {
  describe("with no session", () => {
    it.each(["/", "/visualization", "/anything/else"])(
      "sends %s to the login page",
      (path) => {
        expect(routeFor(path, "signed-out")).toBe("/login");
      },
    );

    it("stays on the login page", () => {
      expect(routeFor("/login", "signed-out")).toBeNull();
    });

    it.each(["/login/mfa", "/login/mfa/setup"])(
      "sends %s back to the login page",
      (path) => {
        expect(routeFor(path, "signed-out")).toBe("/login");
      },
    );
  });

  describe("with a password and no authenticator", () => {
    it.each(["/", "/visualization", "/login", "/login/mfa"])(
      "sends %s to authenticator setup",
      (path) => {
        expect(routeFor(path, "needs-mfa-setup")).toBe("/login/mfa/setup");
      },
    );

    it("stays on authenticator setup", () => {
      expect(routeFor("/login/mfa/setup", "needs-mfa-setup")).toBeNull();
    });
  });

  describe("with a password and an authenticator", () => {
    it.each(["/", "/visualization", "/login", "/login/mfa/setup"])(
      "sends %s to code entry",
      (path) => {
        expect(routeFor(path, "needs-mfa-code")).toBe("/login/mfa");
      },
    );

    it("stays on code entry", () => {
      expect(routeFor("/login/mfa", "needs-mfa-code")).toBeNull();
    });
  });

  describe("with a full session", () => {
    it.each(["/login", "/login/mfa", "/login/mfa/setup"])(
      "sends %s to the home page",
      (path) => {
        expect(routeFor(path, "signed-in")).toBe("/");
      },
    );

    it.each(["/", "/visualization", "/anything/else"])("allows %s", (path) => {
      expect(routeFor(path, "signed-in")).toBeNull();
    });
  });

  it("doesn't treat a path that only starts with the same letters as login", () => {
    expect(routeFor("/loginhistory", "signed-out")).toBe("/login");
    expect(routeFor("/loginhistory", "signed-in")).toBeNull();
  });
});
