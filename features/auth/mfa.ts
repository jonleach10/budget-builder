import { authErrorMessage } from "./authErrorMessage";

export type AuthResult = { ok: true } | { ok: false; message: string };

export type MfaSetup =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; message: string };

type Factor = { id: string; status: string };

/** The part of Supabase's MFA client this needs, so tests can pass a fake. */
export type MfaClient = {
  listFactors(): Promise<{ data: { all: Factor[] } | null; error: unknown }>;
  unenroll(params: { factorId: string }): Promise<{ error: unknown }>;
  enroll(params: { factorType: "totp"; issuer: string }): Promise<{
    data: { id: string; totp: { qr_code: string; secret: string } } | null;
    error: unknown;
  }>;
  challengeAndVerify(params: {
    factorId: string;
    code: string;
  }): Promise<{ error: unknown }>;
};

const ALREADY_SET_UP =
  "An authenticator is already set up. Reload this page to continue.";

function failure(error: unknown): { ok: false; message: string } {
  return { ok: false, message: authErrorMessage(error) };
}

/**
 * Refuses if an authenticator is already verified, because the proxy only
 * checks that on page load and another tab may have finished setup since.
 * Otherwise removes any setup that was started and never finished, because
 * Supabase would keep it and a second attempt could fail.
 */
export async function startMfaSetup(mfa: MfaClient): Promise<MfaSetup> {
  const { data: factors, error: listError } = await mfa.listFactors();
  if (listError || !factors) return failure(listError);

  if (factors.all.some(({ status }) => status === "verified")) {
    return { ok: false, message: ALREADY_SET_UP };
  }

  for (const factor of factors.all) {
    const { error } = await mfa.unenroll({ factorId: factor.id });
    if (error) return failure(error);
  }

  const { data, error } = await mfa.enroll({
    factorType: "totp",
    issuer: "Budget Builder",
  });
  if (error || !data) return failure(error);

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code.trimEnd(),
    secret: data.totp.secret,
  };
}

/** Finishes setup, or checks a code at sign-in, for one known factor. */
export async function confirmMfaCode(
  mfa: MfaClient,
  factorId: string,
  code: string,
): Promise<AuthResult> {
  const { error } = await mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ""),
  });
  return error ? failure(error) : { ok: true };
}

export async function verifyMfaCode(
  mfa: MfaClient,
  code: string,
): Promise<AuthResult> {
  const { data: factors, error } = await mfa.listFactors();
  if (error || !factors) return failure(error);

  const factor = factors.all.find(({ status }) => status === "verified");
  if (!factor) return failure(undefined);

  return confirmMfaCode(mfa, factor.id, code);
}
