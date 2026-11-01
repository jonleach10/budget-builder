"use client"

import * as React from "react"
import { CircleAlert, CircleCheck } from "lucide-react"

import { cn } from "@/lib/utils"

export type NoticeMessage = { tone: "error" | "done"; text: string }

/**
 * A message for the whole screen. Always rendered, so a screen reader announces
 * it, and focused when it appears, because the button that caused it can be a
 * long way down the page.
 */
function Notice({ message }: { message: NoticeMessage | null }) {
  const region = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (message !== null) region.current?.focus()
  }, [message])

  return (
    <div
      ref={region}
      role="status"
      tabIndex={-1}
      className="order-first rounded-xl outline-none empty:absolute focus-visible:ring-2 focus-visible:ring-ring">
      {message && (
        <p
          className={cn(
            "flex items-start gap-2.5 rounded-xl bg-frost-wash px-4 py-3 text-body-sm shadow-hairline",
            message.tone === "error" ? "text-ember-glow" : "text-moon-mist"
          )}>
          {message.tone === "error" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>{message.text}</span>
        </p>
      )}
    </div>
  );
}

/** A message beside the field or dialog it's about. */
function FieldError({ id, message }: { id?: string; message: string | null }) {
  // Always rendered, so a screen reader announces a message when it appears.
  return (
    <div role="alert" id={id}>
      {message && (
        <p className="flex items-start gap-1.5 text-caption text-ember-glow">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}

export { FieldError, Notice }
