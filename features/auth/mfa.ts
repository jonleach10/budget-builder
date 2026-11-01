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

function failure(error: unknown): { ok: false; message: string } {
  return { ok: false, message: authErrorMessage(error) };
}

/**
 * Removes any setup that was started and never finished, because Supabase
 * would otherwise keep it and a second attempt could fail.
 */
export async function startMfaSetup(mfa: MfaClient): Promise<MfaSetup> {
  const { data: factors, error: listError } = await mfa.listFactors();
  if (listError || !factors) return failure(listError);

  for (const factor of factors.all) {
    if (factor.status === "verified") continue;
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
    qrCode: data.totp.qr_code,
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
