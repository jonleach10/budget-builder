import type { StatementAdapter } from "../types";
import { chaseCard } from "./chaseCard";

export const adapters: readonly StatementAdapter[] = [chaseCard];
