import { describe, expect, it, vi } from "vitest";
import { readAuthStage, type AuthReader } from "./readAuthStage";

type FakeOptions = {
  aal?: string;
  noClaims?: boolean;
  factors?: { status: string }[];
  userFails?: boolean;
};

function fakeAuth({ aal, noClaims, factors, userFails }: FakeOptions) {
  return {
    getClaims: vi.fn(async () => ({
      data: noClaims ? null : { claims: { aal } },
      error: null,
    })),
    getUser: vi.fn(async () => ({
      data: { user: userFails ? null : { factors } },
      error: userFails ? new Error("failed") : null,
    })),
  } satisfies AuthReader;
}

describe("readAuthStage", () => {
  it("reads no claims as signed out", async () => {
    expect(await readAuthStage(fakeAuth({ noClaims: true }))).toBe("signed-out");
  });

  it("reads a claims error as signed out", async () => {
    const auth: AuthReader = {
      ...fakeAuth({}),
      getClaims: async () => ({ data: null, error: new Error("bad token") }),
    };
    expect(await readAuthStage(auth)).toBe("signed-out");
  });

  it("reads a thrown error as signed out, so a failure can't let anyone in", async () => {
    const auth: AuthReader = {
      ...fakeAuth({}),
      getClaims: async () => {
        throw new Error("network down");
      },
    };
    expect(await readAuthStage(auth)).toBe("signed-out");
  });

  it("reads aal2 as signed in", async () => {
    expect(await readAuthStage(fakeAuth({ aal: "aal2" }))).toBe("signed-in");
  });

  it("doesn't call the auth server again for a full session", async () => {
    const auth = fakeAuth({ aal: "aal2" });
    await readAuthStage(auth);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("asks for setup with no factors", async () => {
    expect(await readAuthStage(fakeAuth({ aal: "aal1", factors: [] }))).toBe(
      "needs-mfa-setup",
    );
  });

  it("asks for setup when the factor list is missing", async () => {
    expect(await readAuthStage(fakeAuth({ aal: "aal1" }))).toBe(
      "needs-mfa-setup",
    );
  });

  it("asks for setup when the only factor was never verified", async () => {
    expect(
      await readAuthStage(
        fakeAuth({ aal: "aal1", factors: [{ status: "unverified" }] }),
      ),
    ).toBe("needs-mfa-setup");
  });

  it("asks for a code with a verified factor", async () => {
    expect(
      await readAuthStage(
        fakeAuth({
          aal: "aal1",
          factors: [{ status: "unverified" }, { status: "verified" }],
        }),
      ),
    ).toBe("needs-mfa-code");
  });

  it("never treats a missing level as a full session", async () => {
    expect(
      await readAuthStage(fakeAuth({ factors: [{ status: "verified" }] })),
    ).toBe("needs-mfa-code");
  });

  it("reads a failed user lookup as signed out", async () => {
    expect(
      await readAuthStage(fakeAuth({ aal: "aal1", userFails: true })),
    ).toBe("signed-out");
  });
});
