import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  insertTransaction,
  LOGGED_OUT,
  OTHER,
  OWNER,
  passwordOnly,
  runAs,
  withMfa,
  type TestUser,
} from "./harness";

type TableCase = {
  name: string;
  insert: (user: TestUser) => string;
  /** A SET clause that session users are allowed to run. */
  change: string;
  /** Clears what would stop a new row going in. */
  beforeInsert?: string;
  /** Clears what would stop the row being deleted. */
  beforeDelete?: string;
};

const TABLES: readonly TableCase[] = [
  {
    name: "accounts",
    insert: (user) => `insert into public.accounts
      (user_id, name, last_four, format, currency, country)
      values ('${user.id}', 'Savings', '2222', 'chase-bank', 'USD', 'US')`,
    change: "name = 'Changed'",
    beforeDelete: "delete from public.transactions",
  },
  {
    name: "categories",
    insert: (user) => `insert into public.categories (user_id, name)
      values ('${user.id}', 'Dining')`,
    change: "position = 9",
  },
  {
    name: "transactions",
    insert: (user) => insertTransaction(user, "new-row"),
    change: "note = 'Changed'",
  },
  {
    name: "rules",
    insert: (user) => `insert into public.rules
      (user_id, match_on, value, type)
      values ('${user.id}', 'ppdId', '123', 'transfer')`,
    change: "position = 9",
  },
  {
    name: "budget_amounts",
    insert: (user) => `insert into public.budget_amounts
      (user_id, month, country, category_id, amount_minor)
      values ('${user.id}', '2026-11', 'US', '${user.categoryId}', 100)`,
    change: "amount_minor = 1",
  },
  {
    name: "fx_rates",
    insert: (user) => `insert into public.fx_rates
      (user_id, rate_date, base, quote, rate)
      values ('${user.id}', '2026-10-02', 'EUR', 'USD', '1.09')`,
    change: "rate = '2'",
  },
  {
    name: "settings",
    insert: (user) => `insert into public.settings (user_id)
      values ('${user.id}')`,
    change: "base_currency = 'EUR'",
    beforeInsert: "delete from public.settings",
  },
];

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

describe("every table", () => {
  it("is covered by these tests", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select relname from pg_class
       where relkind = 'r' and relnamespace = 'public'::regnamespace
       order by relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual(
      TABLES.map((table) => table.name).sort(),
    );
  });

  it("has row-level security on", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select relname from pg_class
       where relkind = 'r' and relnamespace = 'public'::regnamespace
         and not relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("blocks deleting its user", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select relname from pg_class
       where relkind = 'r' and relnamespace = 'public'::regnamespace
         and oid not in (
           select conrelid from pg_constraint
           where contype = 'f'
             and confrelid = 'auth.users'::regclass
             and confdeltype = 'r'
         )`,
    );
    expect(rows).toEqual([]);
  });
});

describe.each(TABLES)("$name", (table) => {
  const selectAll = `select user_id from public.${table.name}`;
  const updateAll = `update public.${table.name} set ${table.change}`;
  const deleteAll = `delete from public.${table.name}`;

  describe("logged out", () => {
    it.each([
      ["select", selectAll],
      ["insert", table.insert(OWNER)],
      ["update", updateAll],
      ["delete", deleteAll],
    ])("refuses %s", async (_action, sql) => {
      await expect(
        runAs(db, LOGGED_OUT, (tx) => tx.query(sql)),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("another user's rows", () => {
    it("can't be read", async () => {
      const { rows } = await runAs(db, withMfa(OTHER), (tx) =>
        tx.query<{ user_id: string }>(selectAll),
      );
      expect(rows).toEqual([{ user_id: OTHER.id }]);
    });

    it("can't be inserted", async () => {
      await expect(
        runAs(db, withMfa(OTHER), (tx) => tx.exec(table.insert(OWNER))),
      ).rejects.toThrow(/row-level security/);
    });

    it("can't be changed", async () => {
      const { affectedRows } = await runAs(db, withMfa(OTHER), (tx) =>
        tx.query(`${updateAll} where user_id = '${OWNER.id}'`),
      );
      expect(affectedRows).toBe(0);
    });

    it("can't be deleted", async () => {
      const { affectedRows } = await runAs(db, withMfa(OTHER), (tx) =>
        tx.query(`${deleteAll} where user_id = '${OWNER.id}'`),
      );
      expect(affectedRows).toBe(0);
    });
  });

  describe("a password-only session", () => {
    it("reads nothing, even of its own rows", async () => {
      const { rows } = await runAs(db, passwordOnly(OWNER), (tx) =>
        tx.query(selectAll),
      );
      expect(rows).toEqual([]);
    });

    it("can't insert", async () => {
      await expect(
        runAs(db, passwordOnly(OWNER), (tx) => tx.exec(table.insert(OWNER))),
      ).rejects.toThrow(/row-level security/);
    });

    it("changes nothing", async () => {
      const { affectedRows } = await runAs(db, passwordOnly(OWNER), (tx) =>
        tx.query(updateAll),
      );
      expect(affectedRows).toBe(0);
    });

    it("deletes nothing", async () => {
      const { affectedRows } = await runAs(db, passwordOnly(OWNER), (tx) =>
        tx.query(deleteAll),
      );
      expect(affectedRows).toBe(0);
    });
  });

  describe("the owner with MFA", () => {
    it("reads their own row", async () => {
      const { rows } = await runAs(db, withMfa(OWNER), (tx) =>
        tx.query<{ user_id: string }>(selectAll),
      );
      expect(rows).toEqual([{ user_id: OWNER.id }]);
    });

    it("inserts", async () => {
      const count = await runAs(db, withMfa(OWNER), async (tx) => {
        if (table.beforeInsert) await tx.exec(table.beforeInsert);
        await tx.exec(table.insert(OWNER));
        const { rows } = await tx.query(selectAll);
        return rows.length;
      });
      expect(count).toBeGreaterThan(0);
    });

    it("changes their own row", async () => {
      const { affectedRows } = await runAs(db, withMfa(OWNER), (tx) =>
        tx.query(updateAll),
      );
      expect(affectedRows).toBe(1);
    });

    it("deletes their own row", async () => {
      const affected = await runAs(db, withMfa(OWNER), async (tx) => {
        if (table.beforeDelete) await tx.exec(table.beforeDelete);
        const { affectedRows } = await tx.query(deleteAll);
        return affectedRows;
      });
      expect(affected).toBe(1);
    });
  });
});

describe("user_id", () => {
  it("defaults to the session's user", async () => {
    const { rows } = await runAs(db, withMfa(OWNER), (tx) =>
      tx.query<{ user_id: string }>(
        "insert into public.categories (name) values ('Travel') returning user_id",
      ),
    );
    expect(rows).toEqual([{ user_id: OWNER.id }]);
  });

  it.each(TABLES.filter((table) => table.name !== "transactions"))(
    "can't be moved to another user on $name",
    async (table) => {
      await expect(
        runAs(db, withMfa(OWNER), (tx) =>
          tx.query(`update public.${table.name} set user_id = '${OTHER.id}'`),
        ),
      ).rejects.toThrow(/row-level security/);
    },
  );
});
