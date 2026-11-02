import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyImport,
  storedRowWindow,
  type ClassifiedImport,
} from "./classifyImport";
import { StatementError } from "./errors";
import { sha256Hex } from "./fingerprint";
import {
  failureMessage,
  FileRefused,
  IMPORT_UNFINISHED,
  NO_FILES,
} from "./importMessages";
import {
  readImportAccounts,
  readImportCategories,
  readImportRules,
  readSavedRates,
} from "./importStore";
import { parseStatement } from "./parseStatement";
import {
  prepareImport,
  summarizeImport,
  type ImportSummary,
  type StoredCounts,
} from "./prepareImport";
import { readStoredTransactions } from "./storedTransactions";
import type { Account, ParsedStatement, Transaction } from "./types";
import { uploadRefusal } from "./uploadLimit";

/** The part of a browser `File` an import reads. */
export type StatementFile = Pick<File, "name" | "size" | "text">;

export type ImportStatementsInput = {
  files: readonly StatementFile[];
  /** The session's client, so row-level security applies to every read and write. */
  client: SupabaseClient;
  fetch: typeof globalThis.fetch;
  /** The current date, as YYYY-MM-DD. */
  today: string;
};

export type ImportResult =
  | { ok: true; summary: ImportSummary; fileCount: number }
  | { ok: false; message: string };

async function parseFile(
  file: StatementFile,
  accounts: readonly Account[],
): Promise<ParsedStatement> {
  try {
    return await parseStatement({
      fileName: file.name,
      text: await file.text(),
      accounts,
      hash: sha256Hex,
    });
  } catch (error) {
    if (error instanceof StatementError) throw new FileRefused(file.name, error);
    throw error;
  }
}

/** In order, so the first bad file is the one the screen names. */
async function parseFiles(
  files: readonly StatementFile[],
  accounts: readonly Account[],
): Promise<ParsedStatement[]> {
  const statements: ParsedStatement[] = [];
  for (const file of files) statements.push(await parseFile(file, accounts));
  return statements;
}

/** Reads what classification needs. Throws `ReadRowsError` if a read fails. */
async function classifyRows(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  client: SupabaseClient,
): Promise<ClassifiedImport> {
  const window = storedRowWindow(transactions);
  if (window === null) return { decisions: [], pairs: [] };

  const [rules, categories, storedNearby, confirmed] = await Promise.all([
    readImportRules(client),
    readImportCategories(client),
    readStoredTransactions(client, window),
    readStoredTransactions(client, { manualOnly: true }),
  ]);

  return classifyImport({
    transactions,
    storedNearby,
    confirmed,
    accounts,
    rules,
    categories,
  });
}

async function storeFiles({
  files,
  client,
  fetch,
  today,
}: ImportStatementsInput): Promise<ImportResult> {
  const accounts = await readImportAccounts(client);
  const statements = await parseFiles(files, accounts);
  const { rows, transactions, rates, ignoredPendingCount } = await prepareImport({
    statements,
    readSavedRates: readSavedRates(client),
    fetch,
    today,
  });
  const { decisions, pairs } = await classifyRows(transactions, accounts, client);

  const { data, error } = await client.rpc("import_transactions", {
    p_rows: rows.map((row, index) => ({ ...row, ...decisions[index] })),
    p_rates: rates,
    p_pairs: pairs,
  });
  if (error || data === null) return { ok: false, message: IMPORT_UNFINISHED };

  return {
    ok: true,
    fileCount: files.length,
    summary: summarizeImport(data as StoredCounts, ignoredPendingCount),
  };
}

/**
 * Stores a whole upload or none of it. Every file is parsed and every rate found
 * before the one write, and `import_transactions` is a single transaction.
 * Files stay in memory. Never throws, so a caller has no error to log, and a
 * result's message holds no row data.
 */
export async function importStatements(
  input: ImportStatementsInput,
): Promise<ImportResult> {
  const { files } = input;
  if (files.length === 0) return { ok: false, message: NO_FILES };

  const refusal = uploadRefusal(files.map((file) => file.size));
  if (refusal !== null) return { ok: false, message: refusal };

  try {
    return await storeFiles(input);
  } catch (error) {
    return { ok: false, message: failureMessage(error) };
  }
}
