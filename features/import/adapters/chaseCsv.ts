import Papa from "papaparse";
import { StatementError } from "../errors";
import type { StatementSource } from "../types";

export type CsvRow = { line: number; fields: string[] };

const CHASE_FILE_NAME = /^Chase(\d{4})_Activity_.*\.[cC][sS][vV]$/;

export function chaseLastFour({ fileName }: StatementSource): string | null {
  return CHASE_FILE_NAME.exec(fileName)?.[1] ?? null;
}

function isBlank(fields: string[]): boolean {
  return fields.length === 1 && fields[0].trim() === "";
}

/**
 * Reads the data rows after the header with their 1-based file lines. Blank
 * lines are skipped here and not by papaparse, because the line count has to
 * include them, along with any line breaks inside quoted fields.
 */
export function readCsvRows(text: string): CsvRow[] {
  const { data, errors } = Papa.parse<string[]>(text, {
    delimiter: ",",
    newline: "\n",
    skipEmptyLines: false,
  });

  const lines: number[] = [];
  let line = 1;
  for (const fields of data) {
    lines.push(line);
    line += fields.join("").split("\n").length;
  }

  if (errors.length > 0) {
    const row = errors[0].row;
    throw new StatementError(
      "malformed-row",
      row === undefined ? undefined : lines[row],
    );
  }

  return data
    .map((fields, index) => ({ line: lines[index], fields }))
    .slice(1)
    .filter((row) => !isBlank(row.fields));
}
