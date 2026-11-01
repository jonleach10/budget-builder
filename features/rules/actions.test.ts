import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import * as ruleActions from "@/features/rules/actions";
import * as settingsActions from "@/features/settings/actions";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const ACTIONS = Object.entries({ ...ruleActions, ...settingsActions });

const REDIRECT = new Error("redirected to log in");

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(serverClient).mockReset();
});

describe("server actions", () => {
  it("cover both screens", () => {
    expect(ACTIONS.map(([name]) => name).sort()).toEqual([
      "addCategoryAction",
      "addRuleAction",
      "deleteCategoryAction",
      "deleteRuleAction",
      "editRuleAction",
      "moveCategoryAction",
      "moveRuleAction",
      "renameCategoryAction",
    ]);
  });

  it.each(ACTIONS)(
    "%s checks the session before it reaches the database",
    async (_name, action) => {
      vi.mocked(requireSession).mockRejectedValue(REDIRECT);

      const run = action as (...args: string[]) => Promise<unknown>;

      await expect(run("id", "up")).rejects.toBe(REDIRECT);
      expect(serverClient).not.toHaveBeenCalled();
    },
  );
});
