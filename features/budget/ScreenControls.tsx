import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addMonths, monthName } from "./months";
import {
  screenHref,
  VIEW_LABELS,
  VIEWS,
  type ScreenParams,
} from "./screenParams";

function MonthLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof ChevronLeft;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="size-11 text-moon-mist md:size-8">
      <Link href={href} aria-label={label} scroll={false}>
        <Icon strokeWidth={1.5} aria-hidden={true} />
      </Link>
    </Button>
  );
}

/** The month and view live in the URL, so these are links, not state. */
export function ScreenControls({
  path,
  params,
}: {
  path: string;
  params: ScreenParams;
}) {
  const { month, view } = params;
  const monthHref = (count: number) =>
    screenHref(path, { month: addMonths(month, count), view });

  return (
    <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:flex-wrap md:items-center">
      <div className="flex items-center justify-between gap-1 md:inline-flex">
        <MonthLink
          href={monthHref(-1)}
          label="Previous month"
          icon={ChevronLeft}
        />
        <span className="min-w-28 text-center text-body-sm font-medium text-foreground">
          {monthName(month)}
        </span>
        <MonthLink href={monthHref(1)} label="Next month" icon={ChevronRight} />
      </div>

      <nav
        aria-label="Budget view"
        className="flex gap-0.5 rounded-full bg-frost-wash p-[3px] shadow-hairline md:inline-flex">
        {VIEWS.map((option) => {
          const selected = option === view;
          return (
            <Link
              key={option}
              href={screenHref(path, { month, view: option })}
              scroll={false}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-3.5 text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[30px] md:flex-none",
                selected
                  ? "bg-accent text-white"
                  : "text-moon-mist hover:text-white",
              )}>
              {VIEW_LABELS[option]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
