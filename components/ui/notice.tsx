"use client"

import * as React from "react"
import { CircleAlert, CircleCheck } from "lucide-react"

import { cn } from "@/lib/utils"

export type NoticeMessage = {
  tone: "error" | "done"
  text: string
  /** Bank text to show first, in mono, as the screen shows it elsewhere. */
  lead?: string
}

/**
 * A message for the whole screen. Always rendered, so a screen reader announces
 * it, and focused when it appears, because the button that caused it can be a
 * long way down the page. `actions` sit beside the text, or under it on a phone.
 */
function Notice({
  message,
  actions,
}: {
  message: NoticeMessage | null
  actions?: React.ReactNode
}) {
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl bg-frost-wash px-4 py-3 text-body-sm shadow-hairline">
          <p
            className={cn(
              "flex min-w-0 flex-[1_1_100%] items-start gap-2.5 md:flex-[1_1_360px]",
              message.tone === "error" ? "text-ember-glow" : "text-moon-mist"
            )}>
            {message.tone === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {message.lead !== undefined && (
                <span className="font-eyebrow text-foreground">{`${message.lead} `}</span>
              )}
              {message.text}
            </span>
          </p>
          {actions && (
            <div className="flex w-full gap-2 md:w-auto [&>*]:flex-1 md:[&>*]:flex-none">
              {actions}
            </div>
          )}
        </div>
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
