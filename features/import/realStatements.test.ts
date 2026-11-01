import { beforeAll, describe, expect, it } from "vitest";
import {
  buildAccounts,
  checkStatement,
  compareExports,
  readStatementFiles,
  readTransactions,
  type ExportComparison,
  type StatementCheck,
} from "./realStatementsProof";

/*
 * Proves the parsers against real exports on a machine that has them:
 *   REAL_STATEMENTS_DIR=<folder> npx vitest run features/import/realStatements.test.ts
 * Add REAL_STATEMENTS_OLDER_DIR=<folder> to compare with an older export of the
 * same accounts. CI skips this. Assertions see only booleans, counts, and error
 * codes and lines, and test names use an index, so a failure prints no
 * statement data.
 */

const dir = process.env.REAL_STATEMENTS_DIR;
const olderDir = process.env.REAL_STATEMENTS_OLDER_DIR;
const files = dir ? readStatementFiles(dir) : [];
const olderFiles = olderDir ? readStatementFiles(olderDir) : [];
const accounts = buildAccounts([...files, ...olderFiles]);

describe.skipIf(!dir)("real statements", () => {
  it("finds statement files", () => {
    expect(files.length > 0).toBe(true);
  });

  files.forEach((file, index) => {
    describe(`statement ${index + 1}`, () => {
      let check: StatementCheck;

      beforeAll(async () => {
        check = await checkStatement(file, accounts);
      });

      it("parses", () => {
        expect(check.failure).toBeNull();
      });

      it("accounts for every data row", () => {
        expect(check.countsMatch).toBe(true);
      });

      it("matches the sum of the raw amount column", () => {
        expect(check.sumsMatch).toBe(true);
      });

      it("keeps no IBAN-shaped text", () => {
        expect(check.ibanShapedFieldCount).toBe(0);
      });

      it("fills every field the raw text marks", () => {
        expect(check.missedFieldCount).toBe(0);
      });
    });
  });
});

describe.skipIf(!dir || !olderDir)("an older export of the same accounts", () => {
  let comparison: ExportComparison;

  beforeAll(async () => {
    comparison = compareExports(
      await readTransactions(olderFiles, accounts),
      await readTransactions(files, accounts),
    );
  });

  it("shares rows with the newer export", () => {
    expect(comparison.sharedRowCount > 0).toBe(true);
  });

  it("gives every shared row the same fingerprint", () => {
    expect(comparison.matchedRowCount).toBe(comparison.sharedRowCount);
  });
});
