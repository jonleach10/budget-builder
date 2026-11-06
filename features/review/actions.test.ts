import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import * as reviewActions from "./actions";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ACTIONS = Object.entries(reviewActions);

const REDIRECT = new Error("redirected to log in");

/** A client whose writes match no rows, so accepting stops at "changed". */
function clientWithNoRows() {
  const reply = { data: [], error: null };
  const query = {
    update: () => query,
    in: () => query,
    is: () => query,
    eq: () => query,
    select: () => Promise.resolve(reply),
  };
  return { from: () => query };
}

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(serverClient).mockReset();
  vi.mocked(revalidatePath).mockReset();
});

describe("server actions", () => {
  it("cover accepting a group", () => {
    expect(ACTIONS.map(([name]) => name).sort()).toEqual(["acceptGroupAction"]);
  });

  it.each(ACTIONS)(
    "%s checks the session before it reaches the database",
    async (_name, action) => {
      vi.mocked(requireSession).mockRejectedValue(REDIRECT);

      await expect(action(["row-1"], { type: "income" })).rejects.toBe(REDIRECT);
      expect(serverClient).not.toHaveBeenCalled();
    },
  );

  it("refreshes every screen accepting a group changes", async () => {
    vi.mocked(serverClient).mockResolvedValue(
      clientWithNoRows() as unknown as Awaited<ReturnType<typeof serverClient>>,
    );

    await reviewActions.acceptGroupAction(["row-1"], { type: "income" });

    expect(vi.mocked(revalidatePath).mock.calls.flat().sort()).toEqual([
      "/",
      "/budget",
      "/review",
      "/transactions",
    ]);
  });
});
