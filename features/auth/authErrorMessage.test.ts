import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./authErrorMessage";

function apiError(code: string): AuthApiError {
  return new AuthApiError("raw server text", 400, code);
}

describe("authErrorMessage", () => {
  it("gives one message for a wrong email or a wrong password", () => {
    expect(authErrorMessage(apiError("invalid_credentials"))).toBe(
      "The email or password is incorrect. Check them and try again.",
    );
  });

  it("explains a wrong code", () => {
    expect(authErrorMessage(apiError("mfa_verification_failed"))).toBe(
      "That code is incorrect. Enter the current code from your authenticator app.",
    );
  });

  it("explains an expired code", () => {
    expect(authErrorMessage(apiError("mfa_challenge_expired"))).toBe(
      "That code expired. Enter the current code from your authenticator app.",
    );
  });

  it("explains too many attempts", () => {
    expect(authErrorMessage(apiError("over_request_rate_limit"))).toBe(
      "Too many attempts. Wait a few minutes, then try again.",
    );
  });

  it("explains a connection failure", () => {
    expect(
      authErrorMessage(new AuthRetryableFetchError("raw server text", 503)),
    ).toBe(
      "The login service can't be reached. Check your connection and try again.",
    );
  });

  it("falls back for a code it doesn't know", () => {
    expect(authErrorMessage(apiError("user_banned"))).toBe(
      "The request didn't complete. Try again.",
    );
  });

  it.each([
    ["an error with no code", new Error("raw server text")],
    ["a string", "raw server text"],
    ["nothing", undefined],
  ])("falls back for %s", (_name, error) => {
    expect(authErrorMessage(error)).toBe(
      "The request didn't complete. Try again.",
    );
  });

  it("never shows the server's own text", () => {
    expect(authErrorMessage(apiError("user_banned"))).not.toContain("raw");
  });

  it("doesn't read a message off the object's prototype", () => {
    expect(authErrorMessage(apiError("constructor"))).toBe(
      "The request didn't complete. Try again.",
    );
  });
});
