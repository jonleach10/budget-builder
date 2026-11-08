"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { MonthSelect, PeriodControl as PeriodData } from "./accountScreenData";

/**
 * A native select of months. The phone one uses short months, such as "Sep 2026",
 * so From and To fit side by side. Only one of the two shows at a time.
 */
function MonthField({ label, select }: { label: string; select: MonthSelect }) {
  const router = useRouter();
  const open = (month: string) => {
    const option = select.options.find((o) => o.month === month);
    if (option) router.push(option.href, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
      <span
        aria-hidden="true"
        className="text-caption font-medium text-moon-mist md:text-body-sm md:font-normal">
        {label}
      </span>
      {/* Uncontrolled, so the choice stays shown while its page loads. */}
      <NativeSelect
        key={`phone-${select.selected}`}
        aria-label={label}
        defaultValue={select.selected}
        className="md:hidden"
        onChange={(event) => open(event.target.value)}>
        {select.options.map(({ month, shortLabel }) => (
          <option key={month} value={month}>
            {shortLabel}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        key={`desktop-${select.selected}`}
        aria-label={label}
        defaultValue={select.selected}
        className="hidden md:block md:w-[168px]"
        onChange={(event) => open(event.target.value)}>
        {select.options.map(({ month, label: name }) => (
          <option key={month} value={month}>
            {name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * The period lives in the address, so the shortcuts are links. A shortcut is lit
 * only when From and To match it. On a phone the shortcuts go 2 x 2.
 */
export function PeriodControl({ period }: { period: PeriodData }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-6">
      <nav
        aria-label="Period"
        className="grid grid-cols-2 gap-1 rounded-[22px] bg-frost-wash p-[3px] shadow-hairline md:inline-flex md:gap-0.5 md:rounded-full">
        {period.shortcuts.map(({ label, href, lit }) => (
          <Link
            key={label}
            href={href}
            scroll={false}
            aria-current={lit ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center justify-center rounded-full px-2 text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[30px] md:px-3.5",
              lit ? "bg-accent text-white" : "text-moon-mist hover:text-white",
            )}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
        <MonthField label="From" select={period.from} />
        <MonthField label="To" select={period.to} />
      </div>
    </div>
  );
}
