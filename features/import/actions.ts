"use server";

import { revalidatePath } from "next/cache";
import { requireSession, serverClient } from "@/features/auth/requireSession";
import { importStatements, type ImportResult } from "./importStatements";
import { FILES_FIELD } from "./uploadLimit";

/**
 * Logs nothing, because a failure's text can name a statement file. The date is
 * in UTC, so a row dated today in Germany can wait for the next import, and a
 * later import stores it.
 */
export async function importStatementsAction(
  form: FormData,
): Promise<ImportResult> {
  await requireSession();

  const files = form
    .getAll(FILES_FIELD)
    .filter((value): value is File => value instanceof File);

  const result = await importStatements({
    files,
    client: await serverClient(),
    fetch: globalThis.fetch,
    today: new Date().toISOString().slice(0, 10),
  });

  if (result.ok) revalidatePath("/", "layout");
  return result;
}
