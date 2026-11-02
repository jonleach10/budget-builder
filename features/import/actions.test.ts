import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import { fakeImportClient } from "./__fixtures__/fakeImportClient";
import {
  accounts,
  chaseCardFileName,
  loadFixture,
} from "./__fixtures__/load";
import { importStatementsAction } from "./actions";
import { FILES_FIELD } from "./uploadLimit";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const REDIRECT = new Error("redirected to log in");

const ACCOUNT_ROWS = accounts.map((account) => ({
  id: account.id,
  last_four: account.lastFour,
  format: account.format,
  currency: account.currency,
}));

function form(...values: (File | string)[]): FormData {
  const data = new FormData();
  for (const value of values) data.append(FILES_FIELD, value);
  return data;
}

function cardFile(text = loadFixture(chaseCardFileName)): File {
  return new File([text], chaseCardFileName);
}

function useClient(data: Parameters<typeof fakeImportClient>[0] = {}) {
  const fake = fakeImportClient({ accounts: ACCOUNT_ROWS, ...data });
  vi.mocked(serverClient).mockResolvedValue(
    fake.client as Awaited<ReturnType<typeof serverClient>>,
  );
  return fake;
}

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(serverClient).mockReset();
  vi.mocked(revalidatePath).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("importStatementsAction", () => {
  it("checks the session before it reaches the database", async () => {
    vi.mocked(requireSession).mockRejectedValue(REDIRECT);

    await expect(importStatementsAction(form(cardFile()))).rejects.toBe(
      REDIRECT,
    );
    expect(serverClient).not.toHaveBeenCalled();
  });

  it("refreshes the screens after an import", async () => {
    useClient({
      rpcReply: {
        data: { new: 8, skipped: 0, possible_duplicates: 1 },
        error: null,
      },
    });

    const result = await importStatementsAction(form(cardFile()));

    expect(result).toMatchObject({ ok: true, summary: { newRows: 8 } });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("leaves out rows dated after today, by the server's date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    useClient();

    const result = await importStatementsAction(form(cardFile()));

    // Five of the file's eight rows post after October 4.
    expect(result).toMatchObject({ ok: true, summary: { ignoredPending: 5 } });
  });

  it("reads only files from the form", async () => {
    useClient();

    await expect(importStatementsAction(form("not a file"))).resolves.toEqual({
      ok: false,
      message: "Choose at least one CSV file.",
    });
  });

  it("writes nothing to the console and refreshes nothing on a failure", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    useClient({
      rpcReply: { data: null, error: { message: "SYNTHETIC SECRET ROW TEXT" } },
    });

    const result = await importStatementsAction(form(cardFile()));

    expect(result.ok).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
