import { requireSession } from "@/features/auth/requireSession";
import { BudgetScreen } from "@/features/budget/BudgetScreen";
import { loadBudgetScreen } from "@/features/budget/loadScreens";
import { currentMonth } from "@/features/budget/months";
import { readScreenParams } from "@/features/budget/screenParams";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BudgetPage({ searchParams }: PageProps) {
  await requireSession();

  const params = readScreenParams(
    await searchParams,
    currentMonth(new Date()),
  );

  return (
    <BudgetScreen
      key={`${params.month}:${params.view}`}
      params={params}
      screen={await loadBudgetScreen(params)}
    />
  );
}
