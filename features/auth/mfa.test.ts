import { describe, expect, it, vi } from "vitest";
import {
  confirmMfaCode,
  startMfaSetup,
  verifyMfaCode,
  type MfaClient,
} from "./mfa";

const ENROLLED = {
  id: "new-factor",
  totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "SYNTHETICSECRET" },
};

function fakeMfa(factors: { id: string; status: string }[] = []) {
  return {
    listFactors: vi.fn(async () => ({
      data: { all: factors, totp: factors },
      error: null as unknown,
    })),
    unenroll: vi.fn(async () => ({ error: null as unknown })),
    enroll: vi.fn(async () => ({ data: ENROLLED, error: null as unknown })),
    challengeAndVerify: vi.fn(async () => ({ error: null as unknown })),
  } satisfies MfaClient;
}

describe("startMfaSetup", () => {
  it("enrolls an authenticator app and returns what the screen shows", async () => {
    const mfa = fakeMfa();

    expect(await startMfaSetup(mfa)).toEqual({
      ok: true,
      factorId: "new-factor",
      qrCode: ENROLLED.totp.qr_code,
      secret: "SYNTHETICSECRET",
    });
    expect(mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      issuer: "Budget Builder",
    });
  });

  it("drops the newline Supabase ends a QR code with, which next/image refuses", async () => {
    const mfa = fakeMfa();
    mfa.enroll.mockResolvedValue({
      data: {
        ...ENROLLED,
        totp: { ...ENROLLED.totp, qr_code: `${ENROLLED.totp.qr_code}\n` },
      },
      error: null,
    });

    const setup = await startMfaSetup(mfa);

    expect(setup).toMatchObject({ qrCode: ENROLLED.totp.qr_code });
  });

  it("removes an abandoned setup first, so setup can restart", async () => {
    const mfa = fakeMfa([{ id: "abandoned", status: "unverified" }]);

    await startMfaSetup(mfa);

    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "abandoned" });
    expect(mfa.unenroll.mock.invocationCallOrder[0]).toBeLessThan(
      mfa.enroll.mock.invocationCallOrder[0],
    );
  });

  it("refuses to start with a verified factor, and changes nothing", async () => {
    const mfa = fakeMfa([
      { id: "abandoned", status: "unverified" },
      { id: "in-use", status: "verified" },
    ]);

    expect(await startMfaSetup(mfa)).toEqual({
      ok: false,
      message: "An authenticator is already set up. Reload this page to continue.",
    });
    expect(mfa.unenroll).not.toHaveBeenCalled();
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("reports a failure to list factors and enrolls nothing", async () => {
    const mfa = fakeMfa();
    mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [] },
      error: new Error("failed"),
    });

    expect((await startMfaSetup(mfa)).ok).toBe(false);
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("reports a failure to remove an abandoned setup", async () => {
    const mfa = fakeMfa([{ id: "abandoned", status: "unverified" }]);
    mfa.unenroll.mockResolvedValue({ error: new Error("failed") });

    expect((await startMfaSetup(mfa)).ok).toBe(false);
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("reports a failure to enroll", async () => {
    const mfa = fakeMfa();
    mfa.enroll.mockResolvedValue({ data: ENROLLED, error: new Error("failed") });

    expect((await startMfaSetup(mfa)).ok).toBe(false);
  });
});

describe("confirmMfaCode", () => {
  it("checks the code against the new factor", async () => {
    const mfa = fakeMfa();

    expect(await confirmMfaCode(mfa, "new-factor", "123456")).toEqual({
      ok: true,
    });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "new-factor",
      code: "123456",
    });
  });

  it("removes spaces, which authenticator apps often show in a code", async () => {
    const mfa = fakeMfa();

    await confirmMfaCode(mfa, "new-factor", " 123 456 ");

    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "new-factor",
      code: "123456",
    });
  });

  it("reports a wrong code", async () => {
    const mfa = fakeMfa();
    mfa.challengeAndVerify.mockResolvedValue({ error: new Error("failed") });

    expect((await confirmMfaCode(mfa, "new-factor", "000000")).ok).toBe(false);
  });
});

describe("verifyMfaCode", () => {
  it("checks the code against the verified factor", async () => {
    const mfa = fakeMfa([
      { id: "abandoned", status: "unverified" },
      { id: "in-use", status: "verified" },
    ]);

    expect(await verifyMfaCode(mfa, "123456")).toEqual({ ok: true });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "in-use",
      code: "123456",
    });
  });

  it("reports having no verified factor", async () => {
    const mfa = fakeMfa([{ id: "abandoned", status: "unverified" }]);

    expect((await verifyMfaCode(mfa, "123456")).ok).toBe(false);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("reports a failure to list factors", async () => {
    const mfa = fakeMfa();
    mfa.listFactors.mockResolvedValue({
      data: { all: [], totp: [] },
      error: new Error("failed"),
    });

    expect((await verifyMfaCode(mfa, "123456")).ok).toBe(false);
  });
});
