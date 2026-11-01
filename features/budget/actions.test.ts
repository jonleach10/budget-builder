import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import * as budgetActions from "./actions";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const ACTIONS = Object.entries(budgetActions);

const REDIRECT = new Error("redirected to log in");

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(serverClient).mockReset();
});

describe("server actions", () => {
  it("cover saving and copying", () => {
    expect(ACTIONS.map(([name]) => name).sort()).toEqual([
      "copyMonthAction",
      "saveBudgetAction",
    ]);
  });

  it.each(ACTIONS)(
    "%s checks the session before it reaches the database",
    async (_name, action) => {
      vi.mocked(requireSession).mockRejectedValue(REDIRECT);

      const run = action as (...args: unknown[]) => Promise<unknown>;

      await expect(run("2026-10", "US", {})).rejects.toBe(REDIRECT);
      expect(serverClient).not.toHaveBeenCalled();
    },
  );
});
