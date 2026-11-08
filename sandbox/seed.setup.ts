import { expect, test as setup } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { importStatements } from "@/features/import/importStatements";
import { fakeRates } from "./fakeRates.ts";
import {
  ACCOUNT_WITH_NO_ROWS,
  generateStatements,
  SANDBOX_ACCOUNTS,
  sandboxMonths,
} from "./generate.ts";
import { assertLocalSupabase } from "./guard.ts";
import { totpCode } from "./totp.ts";
import {
  type Credentials,
  OWNER,
  type SandboxUser,
  SECOND_USER,
  SETUP_USER,
  saveTotpSecret,
} from "./users.ts";
import { applyWeirdRows, WEIRD_ROWS, type WeirdRows, weirdRowsIn } from "./weirdRows.ts";

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

/**
 * Made up, like every row here. It goes on last month's newest SAMPLE GROCER row,
 * which a rule puts in Groceries, a budgeted category, so Budget shows a label.
 */
const GROCERY_LABEL = "Weekly shop";

const SCHEMA_ATTEMPTS = 100;
const SCHEMA_WAIT_MS = 200;

/** PostgREST's codes for a database it can't reach yet or a schema it hasn't read. */
const SCHEMA_LOADING = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST205"]);

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

/** Through the admin API, which works while signups stay closed. */
async function createUser(user: Credentials): Promise<void> {
  const admin = createClient(required("SANDBOX_URL"), required("SANDBOX_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  check(
    await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    }),
  );
}

function userClient(): SupabaseClient {
  return createClient(required("SANDBOX_URL"), required("SANDBOX_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The same calls the MFA setup page makes, so the session reaches `aal2` for real. */
async function signInWithMfa(client: SupabaseClient, user: SandboxUser): Promise<void> {
  check(
    await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
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
  saveTotpSecret(user, totp.secret);
}

/** Names from SANDBOX_WEIRD_ROWS, comma-separated, refusing any it doesn't know. */
function weirdRowsAsked(): WeirdRows[] {
  const asked = (process.env.SANDBOX_WEIRD_ROWS ?? "").split(",").filter(Boolean);
  const unknown = asked.filter((name) => !(WEIRD_ROWS as readonly string[]).includes(name));
  if (unknown.length > 0) throw new Error(`No weird rows called ${unknown.join(", ")}.`);
  return weirdRowsIn(asked);
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

/** The owner's label, saved the way Edit Row saves one, on a stored row. */
async function labelGroceryRow(
  client: SupabaseClient,
  today: string,
  groceriesId: string | undefined,
): Promise<void> {
  const [month, next] = sandboxMonths(today).slice(-2);
  const found = dataOf(
    await client
      .from("transactions")
      .select("id")
      .eq("category_id", groceriesId)
      .like("description", "SAMPLE GROCER%")
      .gte("posted_on", `${month}-01`)
      .lt("posted_on", `${next}-01`)
      .order("posted_on", { ascending: false })
      .order("id")
      .limit(1),
  );
  if (found.length === 0) throw new Error("No grocery row to label last month.");

  const labeled = dataOf(
    await client
      .from("transactions")
      .update({ note: GROCERY_LABEL })
      .eq("id", found[0].id)
      .select("id"),
  );
  expect(labeled).toHaveLength(1);
}

setup("seed the fake owner's data", async () => {
  assertLocalSupabase(required("SANDBOX_URL"));
  const weirdRows = weirdRowsAsked();

  await createUser(OWNER);
  const client = userClient();
  await signInWithMfa(client, OWNER);
  await waitForSchema(client);

  check(await client.from("settings").insert({ base_currency: "USD" }));
  check(
    await client.from("accounts").insert(
      [...SANDBOX_ACCOUNTS, ACCOUNT_WITH_NO_ROWS].map((account) => ({
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

  await labelGroceryRow(client, today, categoryIds.get("Groceries"));

  // Only on request, after everything the normal seed gives.
  await applyWeirdRows(client, today, weirdRows);
  if (weirdRows.length > 0) console.log(`Weird rows: ${weirdRows.join(", ")}`);
});

/** Signs up with MFA like the owner, and is given nothing: no settings, accounts or rows. */
setup("seed the second user", async () => {
  assertLocalSupabase(required("SANDBOX_URL"));

  await createUser(SECOND_USER);
  await signInWithMfa(userClient(), SECOND_USER);
});

/** A password and nothing else: no authenticator, settings, accounts or rows. */
setup("seed the setup user", async () => {
  assertLocalSupabase(required("SANDBOX_URL"));

  await createUser(SETUP_USER);
});
