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

  it("refuse a repeated last four", async () => {
    await refused(insertAccount("1111"), /unique constraint/);
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
