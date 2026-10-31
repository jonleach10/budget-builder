import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Account, Hash } from "../types";

export function loadFixture(name: string): string {
  return readFileSync(join(__dirname, name), "utf8");
}

export const accounts: Account[] = [
  { id: "bank-1", lastFour: "1111", format: "chase-bank", currency: "USD" },
  { id: "card-1", lastFour: "2222", format: "chase-card", currency: "USD" },
  { id: "euro-1", lastFour: "3333", format: "commerzbank", currency: "EUR" },
];

export const passThroughHash: Hash = (input) => input;

export const chaseBankFileName = "Chase1111_Activity_20261031.csv";
export const chaseCardFileName = "Chase2222_Activity_20261031.csv";
export const commerzbankFileName = "commerzbank-export.csv";
