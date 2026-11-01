import { requireSession, serverClient } from "@/features/auth/requireSession";
import { RulesScreen } from "@/features/rules/RulesScreen";
import { loadRulesScreen } from "@/features/rules/ruleStore";

export default async function RulesPage() {
  await requireSession();

  return <RulesScreen data={await loadRulesScreen(await serverClient())} />;
}
