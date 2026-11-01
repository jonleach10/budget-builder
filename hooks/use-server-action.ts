import { useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/actionResult";

const NO_REPLY: ActionResult = {
  ok: false,
  message: "The server can't be reached. Check your connection and try again.",
};

/** Runs a server action and always ends with a result the screen can show. */
export function useServerAction() {
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<ActionResult>,
    onResult: (result: ActionResult) => void,
  ) {
    startTransition(async () => {
      try {
        onResult(await action());
      } catch (error) {
        // An expired session arrives here as a redirect, which Next has to
        // handle. Anything else means the action never answered.
        unstable_rethrow(error);
        onResult(NO_REPLY);
      }
    });
  }

  return { pending, run };
}
