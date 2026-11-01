import type { ReactNode } from "react";

type PageFrameProps = {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
};

/**
 * The heading and column for an app page. The negative margin leaves a 16px
 * gutter on a phone, because the app layout's padding is sized for a desktop.
 */
export function PageFrame({ title, subtitle, action, children }: PageFrameProps) {
  return (
    <div className="-mx-4 flex flex-col gap-4 md:mx-auto md:w-full md:max-w-[1040px] md:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-heading font-medium text-ice-highlight">
            {title}
          </h1>
          <p className="text-body-sm text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </header>
      <div className="relative flex flex-col gap-4 md:gap-8">{children}</div>
    </div>
  );
}
