import { requireSession } from "@/features/auth/requireSession";
import { currentMonth } from "@/features/budget/months";
import { readScreenParams } from "@/features/budget/screenParams";
import { loadTransactionsScreen } from "@/features/transactions/loadTransactions";
import { TransactionsScreen } from "@/features/transactions/TransactionsScreen";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: PageProps) {
  await requireSession();

  const { month } = readScreenParams(
    await searchParams,
    currentMonth(new Date()),
  );

  return (
    <TransactionsScreen
      month={month}
      screen={await loadTransactionsScreen(month)}
    />
  );
}
