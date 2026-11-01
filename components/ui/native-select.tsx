import * as React from "react"

import { cn } from "@/lib/utils"

/** The Midnight Glass field, for inputs and selects. 44px tall on a phone. */
export const glassField =
  "h-11 rounded-md border-0 bg-muted px-2.5 text-white shadow-hairline placeholder:text-moon-mist/60 focus-visible:shadow-hairline-focus focus-visible:ring-2 focus-visible:ring-ring md:h-9"

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "w-full text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm [&_option]:bg-background [&_option]:text-white",
        glassField,
        className
      )}
      {...props} />
  );
}

export { NativeSelect }
