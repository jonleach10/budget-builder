import { beforeAll, describe, expect, it } from "vitest";
import {
  buildAccounts,
  checkStatement,
  readStatementFiles,
  type StatementCheck,
} from "./realStatementsProof";

/*
 * Proves the parsers against real exports on a machine that has them:
 *   REAL_STATEMENTS_DIR=<folder> npx vitest run features/import/realStatements.test.ts
 * CI skips this. Assertions see only booleans, counts, and error codes and
 * lines, and test names use an index, so a failure prints no statement data.
 */

const dir = process.env.REAL_STATEMENTS_DIR;
const files = dir ? readStatementFiles(dir) : [];
const accounts = buildAccounts(files);

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

      it("has a balance chain that reconciles", () => {
        expect(check.balanceMismatchCount).toBe(0);
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
