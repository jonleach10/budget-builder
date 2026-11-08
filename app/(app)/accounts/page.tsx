import { cookies } from "next/headers";
import {
  LAST_ACCOUNT_COOKIE,
  readAccountParams,
} from "@/features/accounts/accountParams";
import { AccountScreen } from "@/features/accounts/AccountScreen";
import { loadAccountScreen } from "@/features/accounts/loadAccountScreen";
import { requireSession } from "@/features/auth/requireSession";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountsPage({ searchParams }: PageProps) {
  await requireSession();

  const today = new Date().toISOString().slice(0, 10);
  const lastAccount = (await cookies()).get(LAST_ACCOUNT_COOKIE)?.value;
  const { accountId, period } = readAccountParams(
    await searchParams,
    lastAccount,
    today,
  );

  return (
    <AccountScreen screen={await loadAccountScreen(accountId, period, today)} />
  );
}
