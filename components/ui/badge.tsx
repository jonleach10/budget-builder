import * as React from "react"

import { cn } from "@/lib/utils"

type BadgeProps = React.ComponentProps<"span"> & {
  /** A step quieter, for a value that sits beside a normal badge. */
  quiet?: boolean
}

function Badge({ className, quiet = false, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex min-h-[22px] items-center rounded-md px-2 text-caption font-medium",
        quiet ? "bg-frost-wash text-moon-mist" : "bg-accent text-foreground",
        className
      )}
      {...props} />
  );
}

export { Badge }
