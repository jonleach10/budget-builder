import { expect, test as setup } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { importStatements } from "@/features/import/importStatements";
import { generateStatements, SANDBOX_ACCOUNTS, sandboxMonths } from "./generate.ts";
import { assertLocalSupabase } from "./guard.ts";
import { OWNER_EMAIL, OWNER_PASSWORD, saveTotpSecret } from "./owner.ts";
import { totpCode } from "./totp.ts";

const CATEGORIES = [
  "Groceries",
  "Dining",
  "Shopping",
  "Gas",
  "Health",
  "Home",
  "Entertainment",
  "Housing",
  "Insurance",
];

const US_BUDGET: Record<string, number> = {
  Groceries: 60_000,
  Dining: 20_000,
  Shopping: 25_000,
  Gas: 15_000,
  Housing: 185_000,
};

const DE_BUDGET: Record<string, number> = {
  Groceries: 40_000,
  Housing: 95_000,
  Insurance: 4_500,
};

const SCHEMA_ATTEMPTS = 100;
const SCHEMA_WAIT_MS = 200;

/** PostgREST's codes for a database it can't reach yet or a schema it hasn't read. */
const SCHEMA_LOADING = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST205"]);

/** Made up, and the same for every day, so no call reaches the rates service. */
const EUR_TO_USD = 1.08;

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const end = Date.parse(to);

  for (let day = Date.parse(from); day <= end; day += 86_400_000) {
    days.push(new Date(day).toISOString().slice(0, 10));
  }
  return days;
}

const fakeRates: typeof fetch = async (input) => {
  const query = new URL(String(input)).searchParams;
  const base = query.get("base");
  const quote = query.get("quotes");

  return Response.json(
    daysBetween(query.get("from") ?? "", query.get("to") ?? "").map((date) => ({
      date,
      base,
      quote,
      rate: base === "EUR" ? EUR_TO_USD : 1 / EUR_TO_USD,
    })),
  );
};

function check({ error }: { error: unknown }): void {
  if (error) throw error instanceof Error ? error : new Error(JSON.stringify(error));
}

function dataOf<Data>(result: { data: Data | null; error: unknown }): Data {
  check(result);
  if (result.data === null) throw new Error("Supabase returned no data.");
  return result.data;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set. Use npm run sandbox:seed.`);
  return value;
}

/** PostgREST reloads the schema a moment after `db reset` has returned. */
async function waitForSchema(client: SupabaseClient): Promise<void> {
  for (let attempt = 0; attempt < SCHEMA_ATTEMPTS; attempt += 1) {
    const { error } = await client.from("settings").select("user_id").limit(1);
    if (!SCHEMA_LOADING.has(error?.code ?? "")) return;
    await new Promise((resolve) => setTimeout(resolve, SCHEMA_WAIT_MS));
  }
  throw new Error("The local API never loaded the schema.");
}

async function createOwner(url: string, secretKey: string): Promise<void> {
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  check(
    await admin.auth.admin.createUser({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      email_confirm: true,
    }),
  );
}

/** The same calls the MFA setup page makes, so the session reaches `aal2` for real. */
async function signInWithMfa(client: SupabaseClient): Promise<void> {
  check(
    await client.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    }),
  );

  const { id, totp } = dataOf(
    await client.auth.mfa.enroll({ factorType: "totp", issuer: "Budget Builder" }),
  );
  check(
    await client.auth.mfa.challengeAndVerify({
      factorId: id,
      code: totpCode(totp.secret, Date.now() / 1000),
    }),
  );
  saveTotpSecret(totp.secret);
}

async function addCategories(client: SupabaseClient): Promise<Map<string, string>> {
  const rows = CATEGORIES.map((name, position) => ({ name, position }));
  const stored = dataOf(
    await client.from("categories").insert(rows).select("id, name"),
  );
  return new Map(stored.map(({ id, name }) => [name, id]));
}

async function addBudget(
  client: SupabaseClient,
  today: string,
  categoryIds: Map<string, string>,
): Promise<void> {
  const rowsFor = (country: "US" | "DE", budget: Record<string, number>) =>
    sandboxMonths(today).flatMap((month) =>
      Object.entries(budget).map(([name, amount_minor]) => ({
        month,
        country,
        category_id: categoryIds.get(name),
        amount_minor,
      })),
    );

  check(
    await client
      .from("budget_amounts")
      .insert([...rowsFor("US", US_BUDGET), ...rowsFor("DE", DE_BUDGET)]),
  );
}

setup("seed the fake owner's data", async () => {
  const url = required("SANDBOX_URL");
  assertLocalSupabase(url);

  await createOwner(url, required("SANDBOX_SECRET_KEY"));

  const client = createClient(url, required("SANDBOX_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await signInWithMfa(client);
  await waitForSchema(client);

  check(await client.from("settings").insert({ base_currency: "USD" }));
  check(
    await client.from("accounts").insert(
      SANDBOX_ACCOUNTS.map((account) => ({
        name: account.name,
        last_four: account.lastFour,
        format: account.format,
        currency: account.currency,
        country: account.country,
        is_savings: account.isSavings,
      })),
    ),
  );

  const categoryIds = await addCategories(client);
  check(
    await client.from("rules").insert([
      {
        match_on: "descriptionStartsWith",
        value: "SAMPLE GROCER",
        position: 0,
        category_id: categoryIds.get("Groceries"),
      },
      {
        match_on: "descriptionStartsWith",
        value: "SAMPLE COFFEE",
        position: 1,
        category_id: categoryIds.get("Dining"),
      },
      {
        match_on: "descriptionStartsWith",
        value: "SAMPLE PAYROLL",
        position: 2,
        type: "income",
      },
    ]),
  );

  const today = new Date().toLocaleDateString("en-CA");
  await addBudget(client, today, categoryIds);

  const files = generateStatements(today).map(({ name, text }) => ({
    name,
    size: text.length,
    text: async () => text,
  }));
  const result = await importStatements({
    files,
    client,
    fetch: fakeRates,
    today,
  });

  expect(result).toMatchObject({ ok: true, fileCount: files.length });
  if (result.ok) console.log(JSON.stringify(result.summary));
});
