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

/** A client whose reads and writes match no rows, so each action stops at "changed". */
function clientWithNoRows() {
  const reply = { data: [], error: null };
  const query = {
    update: () => query,
    in: () => query,
    is: () => query,
    eq: () => query,
    or: () => query,
    select: () => query,
    then: (onDone: (value: typeof reply) => unknown) =>
      Promise.resolve(reply).then(onDone),
  };
  return { from: () => query };
}

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(serverClient).mockReset();
  vi.mocked(revalidatePath).mockReset();
});

describe("server actions", () => {
  it("cover accepting a group, confirming a transfer and a rule from the inbox", () => {
    expect(ACTIONS.map(([name]) => name).sort()).toEqual([
      "acceptGroupAction",
      "addRuleFromInboxAction",
      "confirmTransferAction",
      "sortByRuleAction",
      "undoRuleSortAction",
    ]);
  });

  it("refreshes the Rules screen and every screen a rule's sort changes", async () => {
    vi.mocked(serverClient).mockResolvedValue(
      clientWithNoRows() as unknown as Awaited<ReturnType<typeof serverClient>>,
    );

    await reviewActions.undoRuleSortAction({
      ruleId: "rule-1",
      created: false,
      type: "transfer",
      categoryId: null,
      fromNoType: ["row-1"],
      fromSpending: [],
    });

    expect(vi.mocked(revalidatePath).mock.calls.flat().sort()).toEqual([
      "/",
      "/budget",
      "/review",
      "/rules",
      "/transactions",
    ]);
  });

  it.each(ACTIONS)(
    "%s checks the session before it reaches the database",
    async (_name, action) => {
      vi.mocked(requireSession).mockRejectedValue(REDIRECT);

      await expect(
        (action as (...args: unknown[]) => Promise<unknown>)(["row-1", "row-2"], {
          type: "income",
        }),
      ).rejects.toBe(REDIRECT);
      expect(serverClient).not.toHaveBeenCalled();
    },
  );

  it("refreshes every screen confirming a transfer changes", async () => {
    vi.mocked(serverClient).mockResolvedValue(
      clientWithNoRows() as unknown as Awaited<ReturnType<typeof serverClient>>,
    );

    await reviewActions.confirmTransferAction(["row-1", "row-2"]);

    expect(vi.mocked(revalidatePath).mock.calls.flat().sort()).toEqual([
      "/",
      "/budget",
      "/review",
      "/rules",
      "/transactions",
    ]);
  });

  it("refreshes every screen accepting a group changes", async () => {
    vi.mocked(serverClient).mockResolvedValue(
      clientWithNoRows() as unknown as Awaited<ReturnType<typeof serverClient>>,
    );

    await reviewActions.acceptGroupAction(["row-1"], { type: "income" });

    expect(vi.mocked(revalidatePath).mock.calls.flat().sort()).toEqual([
      "/",
      "/budget",
      "/review",
      "/rules",
      "/transactions",
    ]);
  });
});
