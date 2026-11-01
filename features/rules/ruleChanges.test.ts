import { describe, expect, it, vi } from "vitest";
import {
  addRule,
  deleteRule,
  editRule,
  moveRule,
  type RuleStore,
} from "./ruleChanges";
import type { RuleForm, RuleRow } from "./rules";

const ID_RULE: RuleRow = {
  id: "id-1",
  match_on: "ppdId",
  value: "000111222",
  position: 0,
  type: "income",
  category_id: null,
};

const SECOND_ID_RULE: RuleRow = {
  id: "id-2",
  match_on: "orderingPartyId",
  value: "DE00ZZZ00000000001",
  position: 1,
  type: "saved",
  category_id: null,
};

const TEXT_RULE: RuleRow = {
  id: "text-1",
  match_on: "descriptionContains",
  value: "CORNER MARKET",
  position: 0,
  type: null,
  category_id: "cat-groceries",
};

const SECOND_TEXT_RULE: RuleRow = {
  id: "text-2",
  match_on: "descriptionStartsWith",
  value: "RIVERSIDE CAFE",
  position: 9,
  type: "spending",
  category_id: null,
};

const FORM: RuleForm = {
  matchOn: "descriptionContains",
  value: "  TRANSIT PASS ",
  type: "spending",
  categoryId: "cat-transport",
};

function fakeStore(
  rows: readonly RuleRow[] | null = [
    ID_RULE,
    SECOND_ID_RULE,
    TEXT_RULE,
    SECOND_TEXT_RULE,
  ],
) {
  return {
    list: vi.fn(async () => rows),
    insert: vi.fn<RuleStore["insert"]>(async () => "done"),
    update: vi.fn<RuleStore["update"]>(async () => "done"),
    remove: vi.fn<RuleStore["remove"]>(async () => "done"),
  } satisfies RuleStore;
}

const SAVE_FAILED = { ok: false, message: "The rule wasn't saved. Try again." };
const GONE = {
  ok: false,
  message: "This rule no longer exists. Reload the page to see the current list.",
};

describe("addRule", () => {
  it("stores the checked rule at the end of its group", async () => {
    const store = fakeStore();

    expect(await addRule(store, FORM)).toEqual({ ok: true });

    expect(store.insert).toHaveBeenCalledWith({
      match_on: "descriptionContains",
      value: "TRANSIT PASS",
      type: null,
      category_id: "cat-transport",
      position: 10,
    });
  });

  it("numbers an ID rule against the other ID rules", async () => {
    const store = fakeStore();

    await addRule(store, { ...FORM, matchOn: "ppdId" });

    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ position: 2 }),
    );
  });

  it("refuses an invalid rule without writing", async () => {
    const store = fakeStore();

    expect(await addRule(store, { ...FORM, value: "   " })).toEqual({
      ok: false,
      message: "Enter a value.",
    });
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("reports a failed read without writing", async () => {
    const store = fakeStore(null);

    expect(await addRule(store, FORM)).toEqual(SAVE_FAILED);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("reports a failed write", async () => {
    const store = fakeStore();
    store.insert.mockResolvedValue("failed");

    expect(await addRule(store, FORM)).toEqual(SAVE_FAILED);
  });
});

describe("editRule", () => {
  it("keeps a rule's place when it stays in its group", async () => {
    const store = fakeStore();

    expect(await editRule(store, TEXT_RULE.id, FORM)).toEqual({ ok: true });

    expect(store.update).toHaveBeenCalledWith(TEXT_RULE.id, {
      match_on: "descriptionContains",
      value: "TRANSIT PASS",
      type: null,
      category_id: "cat-transport",
    });
  });

  it("sends a rule to the end of its new group when its match changes group", async () => {
    const store = fakeStore();

    await editRule(store, TEXT_RULE.id, { ...FORM, matchOn: "ppdId" });

    expect(store.update).toHaveBeenCalledWith(
      TEXT_RULE.id,
      expect.objectContaining({ match_on: "ppdId", position: 2 }),
    );
  });

  it("clears the category when the rule becomes a type rule", async () => {
    const store = fakeStore();

    await editRule(store, TEXT_RULE.id, { ...FORM, type: "transfer" });

    expect(store.update).toHaveBeenCalledWith(
      TEXT_RULE.id,
      expect.objectContaining({ type: "transfer", category_id: null }),
    );
  });

  it("refuses an invalid rule without writing", async () => {
    const store = fakeStore();

    expect(await editRule(store, TEXT_RULE.id, { ...FORM, value: "" })).toEqual({
      ok: false,
      message: "Enter a value.",
    });
    expect(store.update).not.toHaveBeenCalled();
  });

  it("says so when the rule is gone", async () => {
    const store = fakeStore();

    expect(await editRule(store, "missing", FORM)).toEqual(GONE);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("says so when the rule goes while saving", async () => {
    const store = fakeStore();
    store.update.mockResolvedValue("missing");

    expect(await editRule(store, TEXT_RULE.id, FORM)).toEqual(GONE);
  });

  it("reports a failed write", async () => {
    const store = fakeStore();
    store.update.mockResolvedValue("failed");

    expect(await editRule(store, TEXT_RULE.id, FORM)).toEqual(SAVE_FAILED);
  });
});

describe("deleteRule", () => {
  it("removes the rule", async () => {
    const store = fakeStore();

    expect(await deleteRule(store, TEXT_RULE.id)).toEqual({ ok: true });
    expect(store.remove).toHaveBeenCalledWith(TEXT_RULE.id);
  });

  it("says so when the rule is already gone", async () => {
    const store = fakeStore();
    store.remove.mockResolvedValue("missing");

    expect(await deleteRule(store, "missing")).toEqual(GONE);
  });

  it("reports a failed delete", async () => {
    const store = fakeStore();
    store.remove.mockResolvedValue("failed");

    expect(await deleteRule(store, TEXT_RULE.id)).toEqual({
      ok: false,
      message: "The rule wasn't deleted. Try again.",
    });
  });
});

describe("moveRule", () => {
  it("moves a rule within its own group only", async () => {
    const store = fakeStore();

    // Position 0 in the text group, though position 1 is taken by an ID rule.
    expect(await moveRule(store, TEXT_RULE.id, "down")).toEqual({ ok: true });

    expect(store.update.mock.calls).toEqual([
      [SECOND_TEXT_RULE.id, { position: 0 }],
      [TEXT_RULE.id, { position: 1 }],
    ]);
  });

  it("writes nothing at the end of a group", async () => {
    const store = fakeStore();

    expect(await moveRule(store, ID_RULE.id, "up")).toEqual({ ok: true });
    expect(store.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown direction without writing", async () => {
    const store = fakeStore();

    expect(await moveRule(store, ID_RULE.id, "sideways")).toEqual(SAVE_FAILED);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("says so when the rule is gone", async () => {
    expect(await moveRule(fakeStore(), "missing", "up")).toEqual(GONE);
  });

  it("reports a failed read", async () => {
    expect(await moveRule(fakeStore(null), ID_RULE.id, "up")).toEqual(
      SAVE_FAILED,
    );
  });

  it("stops at the first failed write", async () => {
    const store = fakeStore();
    store.update.mockResolvedValue("failed");

    expect(await moveRule(store, TEXT_RULE.id, "down")).toEqual(SAVE_FAILED);
    expect(store.update).toHaveBeenCalledTimes(1);
  });
});
