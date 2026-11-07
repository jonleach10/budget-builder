import Link from "next/link";
import { Check, Upload } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmptyPanel } from "@/features/budget/ScreenParts";
import { cn } from "@/lib/utils";
import { MerchantGroups } from "./MerchantGroups";
import { NoMerchantRows } from "./NoMerchantRows";
import { PossibleDuplicates } from "./PossibleDuplicates";
import { PossibleTransfers } from "./PossibleTransfers";
import type { InboxEmpty, ReviewInbox } from "./reviewInbox";
import { SECTIONS, sectionHref, type ReviewSection } from "./sections";

const TITLE = "Review Inbox";

function SectionTabs({
  section,
  counts,
}: {
  section: ReviewSection;
  counts: Record<ReviewSection, number>;
}) {
  return (
    <nav
      aria-label="Review sections"
      className="grid grid-cols-2 gap-1 rounded-[20px] bg-frost-wash p-1 shadow-hairline md:inline-flex md:gap-0.5 md:self-start md:rounded-full md:p-[3px]">
      {SECTIONS.map(({ value, label, phoneLabel }) => {
        const selected = value === section;
        return (
          <Link
            key={value}
            href={sectionHref(value)}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-full px-3.5 text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[30px]",
              selected ? "bg-accent text-white" : "text-moon-mist hover:text-white",
            )}>
            <span className="hidden md:inline">{label}</span>
            <span className="md:hidden">{phoneLabel}</span>
            <span
              className={cn(
                "ml-1.5 font-normal tabular-nums",
                selected ? "text-moon-mist" : "text-muted-foreground",
              )}>
              {counts[value].toLocaleString("en-US")}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function EmptyInbox({ empty }: { empty: InboxEmpty }) {
  const Icon = empty.kind === "done" ? Check : Upload;
  return (
    <EmptyPanel
      title={empty.title}
      text={empty.text}
      icon={
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-frost-wash text-foreground shadow-hairline">
          <Icon className="size-6" strokeWidth={1.5} aria-hidden="true" />
        </span>
      }>
      {empty.kind === "nothing-imported" && (
        <Button asChild className="h-11 md:h-9">
          <Link href="/import">Go to Import</Link>
        </Button>
      )}
    </EmptyPanel>
  );
}

export function ReviewScreen({
  inbox,
  section,
}: {
  inbox: ReviewInbox | null;
  section: ReviewSection;
}) {
  if (inbox === null) {
    return (
      <PageFrame title={TITLE} subtitle="">
        <Notice
          message={{
            tone: "error",
            text: "The inbox can't be loaded. Reload the page to try again.",
          }}
        />
      </PageFrame>
    );
  }

  if (inbox.empty !== null) {
    return (
      <PageFrame title={TITLE} subtitle={inbox.subtitle}>
        <EmptyInbox empty={inbox.empty} />
      </PageFrame>
    );
  }

  return (
    <PageFrame title={TITLE} subtitle={inbox.subtitle}>
      <SectionTabs
        section={section}
        counts={{
          merchants: inbox.groups.length,
          "no-merchant": inbox.noMerchant.length,
          transfers: inbox.transfers.length,
          duplicates: inbox.duplicates.length,
        }}
      />
      <Section inbox={inbox} section={section} />
    </PageFrame>
  );
}

function Section({
  inbox,
  section,
}: {
  inbox: ReviewInbox;
  section: ReviewSection;
}) {
  switch (section) {
    case "merchants":
      return <MerchantGroups groups={inbox.groups} categories={inbox.categories} />;
    case "no-merchant":
      return <NoMerchantRows rows={inbox.noMerchant} categories={inbox.categories} />;
    case "transfers":
      return <PossibleTransfers matches={inbox.transfers} />;
    case "duplicates":
      return <PossibleDuplicates rows={inbox.duplicates} />;
  }
}
