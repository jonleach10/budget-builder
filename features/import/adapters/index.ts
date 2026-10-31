import type { StatementAdapter } from "../types";
import { chaseBank } from "./chaseBank";
import { chaseCard } from "./chaseCard";
import { commerzbank } from "./commerzbank";

export const adapters: readonly StatementAdapter[] = [
  chaseBank,
  chaseCard,
  commerzbank,
];
