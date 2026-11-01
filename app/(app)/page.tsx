import { requireSession } from "@/features/auth/requireSession";
import { loadOverviewScreen } from "@/features/budget/loadScreens";
import { currentMonth } from "@/features/budget/months";
import { OverviewScreen } from "@/features/budget/OverviewScreen";
import { readScreenParams } from "@/features/budget/screenParams";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OverviewPage({ searchParams }: PageProps) {
  await requireSession();

  const current = currentMonth(new Date());
  const params = readScreenParams(await searchParams, current);

  return (
    <OverviewScreen
      params={params}
      screen={await loadOverviewScreen(params, current)}
    />
  );
}
