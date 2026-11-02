import { requireSession } from "@/features/auth/requireSession";
import { ImportScreen } from "@/features/import/ImportScreen";

export default async function ImportPage() {
  await requireSession();

  return <ImportScreen />;
}
