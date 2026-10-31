import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  insertTransaction,
  OTHER,
  OWNER,
  runAs,
  withMfa,
} from "./harness";

const LOCKED_COLUMNS = [
  "id",
  "user_id",
  "account_id",
  "fingerprint",
  "posted_on",
  "purchased_on",
  "amount_minor",
  "currency",
  "description",
  "purpose",
  "original_amount_minor",
  "original_currency",
  "original_rate",
  "bank_type",
  "bank_category",
  "ppd_id",
  "ordering_party_id",
  "transfer_number",
  "balance_minor",
  "base_amount_minor",
  "base_currency",
  "base_rate",
  "created_at",
];

const EDITABLE_COLUMNS = [
  "type",
  "category_id",
  "category_source",
  "suggested_category_id",
  "note",
  "hidden",
  "possible_duplicate",
  "transfer_pair_id",
];

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

function asOwner<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return runAs(db, withMfa(OWNER), work);
}

function refused(sql: string, message: RegExp): Promise<void> {
  return expect(asOwner((tx) => tx.exec(sql))).rejects.toThrow(message);
}

const insertCategory = (name: string) =>
  `insert into public.categories (name) values ('${name}')`;

const insertRule = (value: string) =>
  `insert into public.rules (match_on, value, type)
   values ('descriptionContains', '${value}', 'spending')`;

const insertBudget = (month: string, amount = "100") =>
  `insert into public.budget_amounts (month, country, category_id, amount_minor)
   values ('${month}', 'US', '${OWNER.categoryId}', ${amount})`;

const insertRate = (rate: string) =>
  `insert into public.fx_rates (rate_date, base, quote, rate)
   values ('2026-10-05', 'EUR', 'USD', '${rate}')`;

describe("transaction columns", () => {
  it("are each either locked or editable", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'transactions'
       order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual(
      [...LOCKED_COLUMNS, ...EDITABLE_COLUMNS].sort(),
    );
  });

  it.each(LOCKED_COLUMNS)("refuses a change to %s", async (column) => {
    await refused(
      `update public.transactions set ${column} = ${column}`,
      /permission denied/,
    );
  });

  it.each(EDITABLE_COLUMNS)("allows a change to %s", async (column) => {
    const { affectedRows } = await asOwner((tx) =>
      tx.query(`update public.transactions set ${column} = ${column}`),
    );
    expect(affectedRows).toBe(1);
  });
});

describe("fingerprints", () => {
  it("are refused when repeated on one account", async () => {
    await refused(insertTransaction(OWNER, "seeded"), /unique constraint/);
  });

  it("can repeat across accounts", async () => {
    const secondAccount = "00000000-0000-4000-8000-0000000000a9";
    await asOwner((tx) =>
      tx.exec(`
        insert into public.accounts
          (id, name, last_four, format, currency, country)
          values ('${secondAccount}', 'Savings', '2222', 'chase-bank', 'USD', 'US');
        ${insertTransaction(OWNER, "seeded", {
          account_id: `'${secondAccount}'`,
        })};
      `),
    );
  });
});

describe("categories on transactions", () => {
  it("are allowed on spending", async () => {
    const { affectedRows } = await asOwner((tx) =>
      tx.query(
        `update public.transactions
         set type = 'spending', category_id = '${OWNER.categoryId}'`,
      ),
    );
    expect(affectedRows).toBe(1);
  });

  it.each(["income", "transfer", "saved", "personal"])(
    "are refused on %s",
    async (type) => {
      await refused(
        `update public.transactions
         set type = '${type}', category_id = '${OWNER.categoryId}'`,
        /only_spending_has_a_category/,
      );
    },
  );

  it("are refused on a row with no type yet", async () => {
    await refused(
      `update public.transactions set category_id = '${OWNER.categoryId}'`,
      /only_spending_has_a_category/,
    );
  });
});

describe("category names", () => {
  it("are refused when repeated by one user", async () => {
    await refused(insertCategory("Groceries"), /unique constraint/);
  });

  it("can repeat across users", async () => {
    const { rows } = await db.query(
      "select user_id from public.categories where name = 'Groceries'",
    );
    expect(rows).toHaveLength(2);
  });
});

describe("category sources", () => {
  it("are refused on an update with no category", async () => {
    await refused(
      "update public.transactions set category_source = 'manual'",
      /source_needs_a_category/,
    );
  });

  it("are refused on an insert with no category", async () => {
    await refused(
      insertTransaction(OWNER, "sourced", { category_source: "'manual'" }),
      /source_needs_a_category/,
    );
  });

  it("are allowed with a category", async () => {
    const { affectedRows } = await asOwner((tx) =>
      tx.query(
        `update public.transactions
         set type = 'spending',
             category_id = '${OWNER.categoryId}',
             category_source = 'manual'`,
      ),
    );
    expect(affectedRows).toBe(1);
  });

  it("clear when the category is cleared", async () => {
    const { rows } = await asOwner(async (tx) => {
      await tx.exec(`
        update public.transactions
        set type = 'spending',
            category_id = '${OWNER.categoryId}',
            category_source = 'rule';
        update public.transactions set category_id = null;
      `);
      return tx.query(
        "select category_id, category_source from public.transactions",
      );
    });
    expect(rows).toEqual([{ category_id: null, category_source: null }]);
  });

  it("can't be cleared by calling the trigger function directly", async () => {
    await refused(
      "select public.clear_category_source()",
      /permission denied for function/,
    );
  });
});

describe("blank text", () => {
  it.each(["", " ", "   ", "\t", "\n"])(
    "is refused as a category name: %j",
    async (name) => {
      await refused(insertCategory(name), /check constraint/);
    },
  );

  it.each(["", " ", "\t"])("is refused as a rule value: %j", async (value) => {
    await refused(insertRule(value), /check constraint/);
  });
});

describe("text the app treats as blank", () => {
  // Every character trim() removes, taken from JavaScript so the check in the
  // migration can't drift from what the app calls blank.
  const BLANK_CHARACTERS = Array.from({ length: 0x10000 }, (_, code) =>
    String.fromCharCode(code),
  ).filter((character) => character.trim() === "");

  const labelled = BLANK_CHARACTERS.map(
    (character) =>
      [
        `U+${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
        character,
      ] as const,
  );

  const COLUMNS = [
    [
      "accounts.name",
      `insert into public.accounts (name, last_four, format, currency, country)
       values ($1, '2222', 'chase-bank', 'USD', 'US')`,
    ],
    ["categories.name", "insert into public.categories (name) values ($1)"],
    [
      "rules.value",
      `insert into public.rules (match_on, value, type)
       values ('descriptionContains', $1, 'spending')`,
    ],
    [
      "transactions.fingerprint",
      insertTransaction(OWNER, "unused", { fingerprint: "$1" }),
    ],
  ] as const;

  it("covers every whitespace character in the language", () => {
    expect(BLANK_CHARACTERS).toHaveLength(25);
    expect(BLANK_CHARACTERS).toContain("\u00A0");
    expect(BLANK_CHARACTERS).toContain("\uFEFF");
  });

  describe.each(COLUMNS)("in %s", (_column, sql) => {
    const store = (text: string) =>
      asOwner((tx) => tx.query(sql, [text]));

    it.each(labelled)("refuses %s alone", async (_label, character) => {
      await expect(store(character)).rejects.toThrow(/check constraint/);
    });

    it("refuses a run of every kind", async () => {
      await expect(store(BLANK_CHARACTERS.join(""))).rejects.toThrow(
        /check constraint/,
      );
    });

    it.each(["A\u00A0B", "\u00A0A", "A\u3000", "\u00DF", "0"])(
      "accepts %j, which has something to read",
      async (text) => {
        const { affectedRows } = await store(text);
        expect(affectedRows).toBe(1);
      },
    );
  });
});

describe("rules", () => {
  it("are refused with both a type and a category", async () => {
    await refused(
      `insert into public.rules (match_on, value, type, category_id)
       values ('ppdId', '123', 'spending', '${OWNER.categoryId}')`,
      /rule_gives_a_type_or_a_category/,
    );
  });

  it("are refused with neither a type nor a category", async () => {
    await refused(
      `insert into public.rules (match_on, value) values ('ppdId', '123')`,
      /rule_gives_a_type_or_a_category/,
    );
  });

  it("are refused with an unknown match", async () => {
    await refused(
      `insert into public.rules (match_on, value, type)
       values ('amount', '123', 'spending')`,
      /check constraint/,
    );
  });
});

describe("amounts", () => {
  it.each(["9007199254740991", "-9007199254740991"])(
    "accept the largest safe size: %s",
    async (amount) => {
      await asOwner((tx) => tx.exec(insertBudget("2026-11", amount)));
    },
  );

  it.each(["9007199254740992", "-9007199254740992"])(
    "refuse anything JavaScript can't hold exactly: %s",
    async (amount) => {
      await refused(insertBudget("2026-11", amount), /minor_units/);
    },
  );
});

describe("original amounts", () => {
  it("are refused with no currency", async () => {
    await refused(
      insertTransaction(OWNER, "foreign", { original_amount_minor: "500" }),
      /original_amount_has_a_currency/,
    );
  });

  it("are refused as a currency alone", async () => {
    await refused(
      insertTransaction(OWNER, "foreign", { original_currency: "'GBP'" }),
      /original_amount_has_a_currency/,
    );
  });

  it("can leave out the rate", async () => {
    await asOwner((tx) =>
      tx.exec(
        insertTransaction(OWNER, "foreign", {
          original_amount_minor: "500",
          original_currency: "'GBP'",
        }),
      ),
    );
  });
});

describe("rates", () => {
  it.each(["1", "1.08", "0.5", "1.0842"])("accept %s", async (rate) => {
    await asOwner((tx) => tx.exec(insertRate(rate)));
  });

  it.each(["0", "0.00", "1e5", "1,5", ".5", "1.", "-1", "abc", ""])(
    "refuse %j",
    async (rate) => {
      await refused(insertRate(rate), /decimal_rate/);
    },
  );
});

describe("budget months", () => {
  it.each(["2026-01", "2026-12"])("accept %s", async (month) => {
    await asOwner((tx) => tx.exec(insertBudget(month)));
  });

  it.each(["2026-00", "2026-13", "2026-1", "26-10", "2026-10-01"])(
    "refuse %s",
    async (month) => {
      await refused(insertBudget(month), /check constraint/);
    },
  );
});

describe("budget currency", () => {
  it.each([
    ["US", "USD"],
    ["DE", "EUR"],
  ])("for %s is %s", async (country, currency) => {
    const { rows } = await asOwner((tx) =>
      tx.query<{ currency: string }>(
        `insert into public.budget_amounts
           (month, country, category_id, amount_minor)
         values ('2026-11', '${country}', '${OWNER.categoryId}', 100)
         returning currency`,
      ),
    );
    expect(rows).toEqual([{ currency }]);
  });
});

describe("accounts", () => {
  const insertAccount = (lastFour: string, format = "chase-bank") =>
    `insert into public.accounts (name, last_four, format, currency, country)
     values ('Savings', '${lastFour}', '${format}', 'USD', 'US')`;

  it.each(["123", "12345", "12a4", "DE12 3456"])(
    "refuse anything but four digits: %s",
    async (lastFour) => {
      await refused(insertAccount(lastFour), /check constraint/);
    },
  );

  it("refuse a repeated last four in one format", async () => {
    await refused(insertAccount("1111"), /unique constraint/);
  });

  it.each([
    ["chase-card", "USD", "US"],
    ["commerzbank", "EUR", "DE"],
  ])("can share a last four across formats: %s", async (format, currency, country) => {
    const { affectedRows } = await asOwner((tx) =>
      tx.query(
        `insert into public.accounts (name, last_four, format, currency, country)
         values ('Second', '1111', '${format}', '${currency}', '${country}')`,
      ),
    );
    expect(affectedRows).toBe(1);
  });

  it("refuse an unknown format", async () => {
    await refused(insertAccount("2222", "paypal"), /check constraint/);
  });

  it("refuse a currency that isn't an ISO code", async () => {
    await refused(
      `insert into public.accounts (name, last_four, format, currency, country)
       values ('Savings', '2222', 'chase-bank', 'usd', 'US')`,
      /currency_code/,
    );
  });
});

describe("a row can't point at another user's", () => {
  it("account", async () => {
    await refused(
      insertTransaction(OWNER, "stolen", { account_id: `'${OTHER.accountId}'` }),
      /foreign key/,
    );
  });

  it("category, on a transaction", async () => {
    await refused(
      `update public.transactions
       set type = 'spending', category_id = '${OTHER.categoryId}'`,
      /foreign key/,
    );
  });

  it("category, as a suggestion", async () => {
    await refused(
      `update public.transactions
       set suggested_category_id = '${OTHER.categoryId}'`,
      /foreign key/,
    );
  });

  it("category, on a rule", async () => {
    await refused(
      `insert into public.rules (match_on, value, category_id)
       values ('ppdId', '123', '${OTHER.categoryId}')`,
      /foreign key/,
    );
  });

  it("category, on a budget", async () => {
    await refused(
      `insert into public.budget_amounts
         (month, country, category_id, amount_minor)
       values ('2026-11', 'US', '${OTHER.categoryId}', 100)`,
      /foreign key/,
    );
  });
});

describe("deleting a category", () => {
  it("sends its transactions back to review", async () => {
    const { rows } = await asOwner(async (tx) => {
      await tx.exec(`
        update public.transactions
        set type = 'spending',
            category_id = '${OWNER.categoryId}',
            suggested_category_id = '${OWNER.categoryId}';
        delete from public.categories;
      `);
      return tx.query(
        "select type, category_id, suggested_category_id from public.transactions",
      );
    });
    expect(rows).toEqual([
      { type: "spending", category_id: null, suggested_category_id: null },
    ]);
  });

  it.each(["manual", "rule", "history", "bank-type"])(
    "clears a source of %s and keeps the type",
    async (source) => {
      const { rows } = await asOwner(async (tx) => {
        await tx.exec(`
          update public.transactions
          set type = 'spending',
              category_id = '${OWNER.categoryId}',
              category_source = '${source}';
          delete from public.categories;
        `);
        return tx.query(
          "select type, category_id, category_source from public.transactions",
        );
      });
      expect(rows).toEqual([
        { type: "spending", category_id: null, category_source: null },
      ]);
    },
  );

  it("removes its rules", async () => {
    const { rows } = await asOwner(async (tx) => {
      await tx.exec("delete from public.categories");
      return tx.query("select id from public.rules");
    });
    expect(rows).toEqual([]);
  });

  it("removes its budget amounts", async () => {
    const { rows } = await asOwner(async (tx) => {
      await tx.exec("delete from public.categories");
      return tx.query("select month from public.budget_amounts");
    });
    expect(rows).toEqual([]);
  });
});

describe("deleting an account", () => {
  it("is refused while it has transactions", async () => {
    await refused("delete from public.accounts", /foreign key/);
  });
});

describe("deleting a user", () => {
  it("is refused while they have rows", async () => {
    await expect(
      db.exec(`delete from auth.users where id = '${OWNER.id}'`),
    ).rejects.toThrow(/foreign key/);
  });
});
