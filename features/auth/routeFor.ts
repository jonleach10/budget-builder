export type AuthStage =
  | "signed-out"
  | "needs-mfa-setup"
  | "needs-mfa-code"
  | "signed-in";

export const LOGIN_PATH = "/login";
export const MFA_CODE_PATH = "/login/mfa";
export const MFA_SETUP_PATH = "/login/mfa/setup";
export const HOME_PATH = "/";

function isLoginPath(path: string): boolean {
  return path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`);
}

/** Each stage below full sign-in has exactly one page it's allowed to be on. */
const ONLY_PAGE: Record<Exclude<AuthStage, "signed-in">, string> = {
  "signed-out": LOGIN_PATH,
  "needs-mfa-setup": MFA_SETUP_PATH,
  "needs-mfa-code": MFA_CODE_PATH,
};

/** Returns where a request has to go instead, or null if it can stay. */
export function routeFor(path: string, stage: AuthStage): string | null {
  if (stage === "signed-in") return isLoginPath(path) ? HOME_PATH : null;

  const onlyPage = ONLY_PAGE[stage];
  return path === onlyPage ? null : onlyPage;
}
