import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";

const ENTER_CURRENT_CODE = "Enter the current code from your authenticator app.";

const MESSAGES = new Map<string, string>([
  [
    "invalid_credentials",
    "The email or password is incorrect. Check them and try again.",
  ],
  ["mfa_verification_failed", `That code is incorrect. ${ENTER_CURRENT_CODE}`],
  ["mfa_challenge_expired", `That code expired. ${ENTER_CURRENT_CODE}`],
  [
    "over_request_rate_limit",
    "Too many attempts. Wait a few minutes, then try again.",
  ],
]);

const CONNECTION_FAILED =
  "The login service can't be reached. Check your connection and try again.";
const FALLBACK = "The request didn't complete. Try again.";

/** Never returns the server's own text, which isn't written for this screen. */
export function authErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return CONNECTION_FAILED;
  if (isAuthApiError(error) && error.code !== undefined) {
    return MESSAGES.get(error.code) ?? FALLBACK;
  }
  return FALLBACK;
}
