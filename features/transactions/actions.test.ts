import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import * as transactionActions from "./actions";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ACTIONS = Object.entries(transactionActions);

const REDIRECT = new Error("redirected to log in");

/** A client whose row reads find nothing, so an edit stops at "not saved". */
function clientWithNoRows() {
  const reply = { data: [], error: null };
  const query = { select: () => query, eq: () => Promise.resolve(reply) };
  return { from: () => query };
}

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(serverClient).mockReset();
  vi.mocked(revalidatePath).mockReset();
});

describe("server actions", () => {
  it("cover row edits", () => {
    expect(ACTIONS.map(([name]) => name).sort()).toEqual(["editRowAction"]);
  });

  it.each(ACTIONS)(
    "%s checks the session before it reaches the database",
    async (_name, action) => {
      vi.mocked(requireSession).mockRejectedValue(REDIRECT);

      await expect(action("row-1", { hidden: true })).rejects.toBe(REDIRECT);
      expect(serverClient).not.toHaveBeenCalled();
    },
  );

  it("refreshes every screen an edit changes", async () => {
    vi.mocked(serverClient).mockResolvedValue(
      clientWithNoRows() as unknown as Awaited<ReturnType<typeof serverClient>>,
    );

    await transactionActions.editRowAction("row-1", { hidden: true });

    expect(vi.mocked(revalidatePath).mock.calls.flat().sort()).toEqual([
      "/",
      "/budget",
      "/transactions",
    ]);
  });
});
