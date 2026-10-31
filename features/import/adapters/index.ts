import type { StatementAdapter } from "../types";
import { chaseBank } from "./chaseBank";
import { chaseCard } from "./chaseCard";

export const adapters: readonly StatementAdapter[] = [chaseBank, chaseCard];
