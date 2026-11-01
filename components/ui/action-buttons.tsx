import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof Button>

type IconButtonProps = Omit<ButtonProps, "aria-label" | "children"> & {
  /** What the button does, for anyone who can't see the icon. */
  label: string
  icon: React.ComponentType<{ strokeWidth?: number; "aria-hidden"?: boolean }>
}

/** A round icon action, 44px on a phone so it's easy to hit. */
function IconButton({ label, icon: Icon, className, ...props }: IconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn("size-11 text-moon-mist md:size-8", className)}
      {...props}>
      <Icon strokeWidth={1.5} aria-hidden={true} />
    </Button>
  );
}

/** The outlined pill, for actions that sit beside a primary button. */
function OutlineButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn("h-11 text-foreground shadow-hairline md:h-9", className)}
      {...props} />
  );
}

/** The outlined pill with ember text, for confirming something that can't be undone. */
function DangerButton({ className, ...props }: ButtonProps) {
  return (
    <OutlineButton
      className={cn("text-ember-glow hover:text-ember-glow", className)}
      {...props} />
  );
}

export { DangerButton, IconButton, OutlineButton }
