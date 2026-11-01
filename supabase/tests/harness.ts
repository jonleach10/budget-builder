import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Stands in for what a Supabase project already has. The default privileges
 * matter: they grant every new table to anon, so a test can only prove the
 * migration takes that access away if the stand-in hands it out first.
 */
const SUPABASE_STAND_IN = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;

  create schema auth;
  create table auth.users (id uuid primary key);

  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;

  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  alter default privileges in schema public
    grant all on tables to anon, authenticated;
`;

export type TestUser = { id: string; accountId: string; categoryId: string };

export const OWNER: TestUser = {
  id: "00000000-0000-4000-8000-00000000000a",
  accountId: "00000000-0000-4000-8000-0000000000a1",
  categoryId: "00000000-0000-4000-8000-0000000000a2",
};

export const OTHER: TestUser = {
  id: "00000000-0000-4000-8000-00000000000b",
  accountId: "00000000-0000-4000-8000-0000000000b1",
  categoryId: "00000000-0000-4000-8000-0000000000b2",
};

/** Values for a row a bank statement could produce. All of them are synthetic. */
export function insertTransaction(
  user: TestUser,
  fingerprint: string,
  extra: Readonly<Record<string, string>> = {},
): string {
  const values: Record<string, string> = {
    user_id: `'${user.id}'`,
    account_id: `'${user.accountId}'`,
    fingerprint: `'${fingerprint}'`,
    posted_on: "'2026-10-01'",
    amount_minor: "-1250",
    currency: "'USD'",
    description: "'SYNTHETIC SHOP'",
    base_amount_minor: "-1250",
    base_currency: "'USD'",
    base_rate: "'1'",
    ...extra,
  };
  return `insert into public.transactions (${Object.keys(values).join(", ")})
    values (${Object.values(values).join(", ")})`;
}

function seedUser(user: TestUser): string {
  return `
    insert into auth.users (id) values ('${user.id}');
    insert into public.accounts (id, user_id, name, last_four, format, currency, country)
      values ('${user.accountId}', '${user.id}', 'Checking', '1111', 'chase-bank', 'USD', 'US');
    insert into public.categories (id, user_id, name)
      values ('${user.categoryId}', '${user.id}', 'Groceries');
    ${insertTransaction(user, "seeded")};
    insert into public.rules (user_id, match_on, value, category_id)
      values ('${user.id}', 'descriptionContains', 'SYNTHETIC', '${user.categoryId}');
    insert into public.budget_amounts (user_id, month, country, category_id, amount_minor)
      values ('${user.id}', '2026-10', 'US', '${user.categoryId}', 50000);
    insert into public.fx_rates (user_id, rate_date, base, quote, rate)
      values ('${user.id}', '2026-10-01', 'EUR', 'USD', '1.08');
    insert into public.settings (user_id) values ('${user.id}');
  `;
}

/** Builds a database from the real migration files, with one user and a rival. */
export async function createTestDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STAND_IN);

  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  await db.exec(seedUser(OWNER));
  await db.exec(seedUser(OTHER));
  return db;
}

export type Session =
  | { role: "anon" }
  | { role: "authenticated"; user: TestUser; aal: "aal1" | "aal2" };

export const LOGGED_OUT: Session = { role: "anon" };

export function withMfa(user: TestUser): Session {
  return { role: "authenticated", user, aal: "aal2" };
}

export function passwordOnly(user: TestUser): Session {
  return { role: "authenticated", user, aal: "aal1" };
}

function claimsOf(session: Session): string {
  if (session.role === "anon") return JSON.stringify({ role: "anon" });
  return JSON.stringify({
    role: session.role,
    sub: session.user.id,
    aal: session.aal,
  });
}

/** Runs work as a session, then rolls back, so tests can't affect each other. */
export async function runAs<T>(
  db: PGlite,
  session: Session,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  await db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      claimsOf(session),
    ]);
    await tx.exec(`set local role ${session.role}`);
    result = await work(tx);
    await tx.rollback();
  });
  return result as T;
}
