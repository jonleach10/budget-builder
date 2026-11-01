import { requireSession, serverClient } from "@/features/auth/requireSession";
import { loadCategories } from "@/features/settings/categoryStore";
import { SettingsScreen } from "@/features/settings/SettingsScreen";

export default async function SettingsPage() {
  await requireSession();

  return (
    <SettingsScreen categories={await loadCategories(await serverClient())} />
  );
}
