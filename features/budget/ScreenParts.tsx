import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";

/** The review count and other messages that need no reply. */
export function InfoNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-frost-wash px-4 py-3 text-body-sm text-moon-mist shadow-hairline">
      <Info
        className="size-4 shrink-0 text-signal-blue"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  );
}

export function Meter({
  percent,
  label,
  over,
}: {
  percent: number;
  label: string;
  over: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${over ? "bg-ember-glow" : "bg-chart-1"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** A negative amount carries an icon and its sign as well as the color. */
export function RemainingAmount({
  text,
  over,
  suffix = "",
}: {
  text: string;
  over: boolean;
  suffix?: string;
}) {
  if (!over) return <span>{`${text}${suffix}`}</span>;

  return (
    <span className="inline-flex items-center gap-1 text-ember-glow">
      <TriangleAlert
        className="size-4 shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      {`${text}${suffix}`}
    </span>
  );
}

/** Glass with the faint grid, which is only for screens with no figures. */
export function EmptyPanel({
  title,
  text,
  icon,
  children,
}: {
  title: string;
  text: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-card px-6 py-16 text-center shadow-glass">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(var(--color-frost-wash)_1px,transparent_1px),linear-gradient(90deg,var(--color-frost-wash)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      />
      <div className="relative mx-auto flex max-w-[420px] flex-col items-center gap-3">
        {icon}
        <h2 className="text-body font-medium text-ice-highlight">{title}</h2>
        <p className="text-body-sm text-moon-mist">{text}</p>
        {children}
      </div>
    </section>
  );
}

export function NoRatePanel({ message }: { message: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-glass md:p-6">
      <InfoNotice text={message} />
      <p className="text-body-sm text-moon-mist">
        The US and Germany views still show their own amounts.
      </p>
    </section>
  );
}
