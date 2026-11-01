"use client";

import { browserMfa } from "./browserAuth";
import { verifyMfaCode } from "./mfa";
import { MfaCodeForm } from "./MfaCodeForm";

export function MfaVerifyForm() {
  return <MfaCodeForm submit={(code) => verifyMfaCode(browserMfa(), code)} />;
}
