import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmTransfer,
  type TransferStore,
} from "@/features/review/confirmTransfer";
import { transferStore } from "@/features/review/transferStore";
import { databaseClient } from "./databaseClient";
import {
  createTestDatabase,
  insertTransaction,
  OTHER,
  OWNER,
  passwordOnly,
} from "./harness";

const LOG_METHODS = ["log", "info", "warn", "error", "debug"] as const;

const SAVINGS = "00000000-0000-4000-8000-0000000000a3";
const OUT = "00000000-0000-4000-8000-0000000000e1";
const IN = "00000000-0000-4000-8000-0000000000e2";
const OLD_PAIR = "00000000-0000-4000-8000-0000000000d1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CHANGED = {
  ok: false,
  message:
    "One of these rows has changed, so this transfer wasn't saved. Check the rows, then try again.",
};

type PairState = {
  id: string;
  type: string | null;
  transfer_pair_id: string | null;
};

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`
    insert into public.accounts (id, user_id, name, last_four, format, currency, country)
      values ('${SAVINGS}', '${OWNER.id}', 'Savings', '2222', 'chase-bank', 'USD', 'US');
  `);
}, 60_000);

// These writes commit, as the app's do, so each test starts from the seeded rows.
beforeEach(async () => {
  await db.exec(`delete from public.transactions where fingerprint <> 'seeded'`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Money out of checking and into savings, both in review. */
async function addMatch(
  outExtra: Readonly<Record<string, string>> = {},
  inExtra: Readonly<Record<string, string>> = {},
): Promise<void> {
  await db.exec(
    insertTransaction(OWNER, "row-out", {
      id: `'${OUT}'`,
      amount_minor: "-50000",
      base_amount_minor: "-50000",
      ...outExtra,
    }),
  );
  await db.exec(
    insertTransaction(OWNER, "row-in", {
      id: `'${IN}'`,
      account_id: `'${SAVINGS}'`,
      amount_minor: "50000",
      base_amount_minor: "50000",
      ...inExtra,
    }),
  );
}

async function pairStates(): Promise<PairState[]> {
  const { rows } = await db.query<PairState>(
    `select id, type, transfer_pair_id from public.transactions
     where id = any($1::uuid[]) order by id`,
    [[OUT, IN]],
  );
  return rows;
}

function confirm(store: TransferStore = transferStore(databaseClient(db))) {
  return confirmTransfer(store, [OUT, IN]);
}

/** The real store, which lets `change` run between the read and the update. */
function storeChangingBeforePair(change: string): TransferStore {
  const real = transferStore(databaseClient(db));
  return {
    ...real,
    async pair(ids, pairId) {
      await db.exec(change);
      return real.pair(ids, pairId);
    },
  };
}

describe("confirming a transfer", () => {
  it("gives both rows one new pair ID and the transfer type", async () => {
    await addMatch();

    const result = await confirm();

    expect(result).toEqual({ ok: true, notice: "The rows are marked as a transfer." });
    const [out, into] = await pairStates();
    expect(out).toMatchObject({ type: "transfer" });
    expect(into).toMatchObject({ type: "transfer" });
    expect(out.transfer_pair_id).toMatch(UUID);
    expect(into.transfer_pair_id).toBe(out.transfer_pair_id);
  });

  it("takes a row already typed as a transfer with no pair", async () => {
    await addMatch({ type: "'transfer'" });

    await expect(confirm()).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ["paired", { type: "'transfer'", transfer_pair_id: `'${OLD_PAIR}'` }],
    ["given another type", { type: "'income'" }],
    ["hidden", { hidden: "true" }],
  ])("refuses a row %s, and changes neither", async (_name, change) => {
    await addMatch({}, change);
    const before = await pairStates();

    await expect(confirm()).resolves.toEqual(CHANGED);
    await expect(pairStates()).resolves.toEqual(before);
  });

  it.each([
    ["given another type", `type = 'income'`],
    ["paired", `type = 'transfer', transfer_pair_id = '${OLD_PAIR}'`],
    ["hidden", `hidden = true`],
  ])(
    "leaves no half pair when a row is %s between the read and the update",
    async (_name, set) => {
      await addMatch();

      const result = await confirm(
        storeChangingBeforePair(
          `update public.transactions set ${set} where id = '${IN}'`,
        ),
      );

      expect(result).toEqual(CHANGED);
      await expect(pairStates()).resolves.toContainEqual({
        id: OUT,
        type: null,
        transfer_pair_id: null,
      });
      const { rows } = await db.query(
        `select id from public.transactions
         where transfer_pair_id is not null and transfer_pair_id <> $1`,
        [OLD_PAIR],
      );
      expect(rows).toEqual([]);
    },
  );

  it("gives a row that was already a transfer its type back when it undoes", async () => {
    await addMatch({ type: "'transfer'" });

    await confirm(
      storeChangingBeforePair(
        `update public.transactions set type = 'income' where id = '${IN}'`,
      ),
    );

    await expect(pairStates()).resolves.toContainEqual({
      id: OUT,
      type: "transfer",
      transfer_pair_id: null,
    });
  });
});

describe("a transfer that can't be confirmed", () => {
  it("refuses two rows on one account", async () => {
    await addMatch({}, { account_id: `'${OWNER.accountId}'` });

    const result = await confirm();

    expect(result.ok).toBe(false);
    await expect(pairStates()).resolves.toMatchObject([
      { transfer_pair_id: null },
      { transfer_pair_id: null },
    ]);
  });

  it("refuses another user's row", async () => {
    await addMatch();
    await db.exec(
      `delete from public.transactions where id = '${IN}';
       ${insertTransaction(OTHER, "theirs", { id: `'${IN}'`, amount_minor: "50000" })}`,
    );

    await expect(confirm()).resolves.toEqual(CHANGED);
    await expect(pairStates()).resolves.toMatchObject([
      { transfer_pair_id: null },
      { transfer_pair_id: null },
    ]);
  });

  it("refuses a session that hasn't passed MFA", async () => {
    await addMatch();

    const result = await confirm(
      transferStore(databaseClient(db, passwordOnly(OWNER))),
    );

    expect(result.ok).toBe(false);
    await expect(pairStates()).resolves.toMatchObject([
      { transfer_pair_id: null },
      { transfer_pair_id: null },
    ]);
  });

  it("keeps row data out of the message and the logs", async () => {
    await addMatch({}, { type: "'income'" });
    const logged = LOG_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    const result = await confirm();

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|0000-4000|500/);
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });
});
