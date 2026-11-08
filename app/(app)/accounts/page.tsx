import { readAccountParam } from "@/features/accounts/accountParams";
import { AccountScreen } from "@/features/accounts/AccountScreen";
import { loadAccountScreen } from "@/features/accounts/loadAccountScreen";
import { requireSession } from "@/features/auth/requireSession";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountsPage({ searchParams }: PageProps) {
  await requireSession();

  const today = new Date().toISOString().slice(0, 10);
  const accountId = readAccountParam(await searchParams);

  return <AccountScreen screen={await loadAccountScreen(accountId, today)} />;
}
