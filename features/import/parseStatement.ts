import { adapters } from "./adapters";
import { StatementError } from "./errors";
import { addFingerprints } from "./fingerprint";
import { redactRow } from "./redact";
import type {
  Account,
  Hash,
  ParsedStatement,
  StatementAdapter,
  StatementSource,
} from "./types";

export type ParseStatementInput = StatementSource & {
  accounts: readonly Account[];
  hash: Hash;
};

function normalize(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

function selectAdapter(text: string): StatementAdapter {
  const [headerRow] = text.split("\n");
  const adapter = adapters.find((candidate) => candidate.detect(headerRow));
  if (!adapter) throw new StatementError("unknown-format");
  return adapter;
}

function resolveAccount(
  adapter: StatementAdapter,
  source: StatementSource,
  accounts: readonly Account[],
): Account {
  const lastFour = adapter.lastFour(source);
  const matches = accounts.filter((account) => account.lastFour === lastFour);
  const sameFormat = matches.filter((account) => account.format === adapter.id);

  if (sameFormat.length === 1) return sameFormat[0];
  if (matches.length > 0 && sameFormat.length === 0) {
    throw new StatementError("account-format-mismatch");
  }
  throw new StatementError("unknown-account");
}

/**
 * Turns one statement file into cleaned transactions. Any bad row fails the
 * whole file with a StatementError. Redaction runs here and not in the adapters,
 * so a new adapter can't forget it, and it runs before fingerprinting so the
 * hash never sees bank text that isn't kept.
 */
export async function parseStatement({
  fileName,
  text,
  accounts,
  hash,
}: ParseStatementInput): Promise<ParsedStatement> {
  const normalized = normalize(text);
  const adapter = selectAdapter(normalized);
  const account = resolveAccount(
    adapter,
    { fileName, text: normalized },
    accounts,
  );

  const { rows, ignoredPendingCount } = adapter.parse(normalized, account);
  const transactions = await addFingerprints(
    rows.map(redactRow),
    account.id,
    hash,
  );

  return {
    accountId: account.id,
    format: adapter.id,
    transactions,
    ignoredPendingCount,
  };
}
