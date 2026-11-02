"use client";

import { useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { Laptop, Upload, X } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { IconButton, OutlineButton } from "@/components/ui/action-buttons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice, type NoticeMessage } from "@/components/ui/notice";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import { importStatementsAction } from "./actions";
import type { ImportResult } from "./importStatements";
import type { ImportSummary } from "./prepareImport";
import {
  addFiles,
  FILES_FIELD,
  formatSize,
  sizeText,
  uploadRefusal,
} from "./uploadLimit";

const SUBTITLE =
  "Add Chase and Commerzbank CSV files. Rows already stored are skipped, and the files aren't kept.";

const REVIEW_PATH = "/review";

type Finished = Extract<ImportResult, { ok: true }>;

function IconTile({
  icon: Icon,
}: {
  icon: ComponentType<{
    className?: string;
    strokeWidth?: number;
    "aria-hidden"?: boolean;
  }>;
}) {
  return (
    <span className="inline-flex size-14 items-center justify-center rounded-full bg-frost-wash text-foreground shadow-hairline">
      <Icon className="size-6" strokeWidth={1.5} aria-hidden={true} />
    </span>
  );
}

function ChosenFiles({
  files,
  busy,
  onRemove,
}: {
  files: readonly File[];
  busy: boolean;
  onRemove: (file: File) => void;
}) {
  return (
    <ul className="rounded-xl bg-frost-wash shadow-hairline">
      {files.map((file) => (
        <li
          key={`${file.name}-${file.size}`}
          className="grid min-h-11 grid-cols-[minmax(0,1fr)_72px_32px] items-center gap-3 border-b border-border py-1 pr-2 pl-4 last:border-b-0">
          <span className="font-eyebrow text-body-sm [overflow-wrap:anywhere]">
            {file.name}
          </span>
          <span className="text-right text-caption text-muted-foreground tabular-nums">
            {formatSize(file.size)}
          </span>
          <IconButton
            label={`Remove ${file.name}`}
            icon={X}
            disabled={busy}
            onClick={() => onRemove(file)}
          />
        </li>
      ))}
    </ul>
  );
}

function ChooseFiles({
  files,
  busy,
  onAdd,
  onRemove,
  onImport,
}: {
  files: readonly File[];
  busy: boolean;
  onAdd: (added: readonly File[]) => void;
  onRemove: (file: File) => void;
  onImport: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <Card
      role="group"
      aria-label="Choose files"
      className="flex flex-col gap-5 p-6">
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) onAdd(Array.from(event.dataTransfer.files));
        }}>
        <IconTile icon={Upload} />
        <p className="text-body-sm font-medium text-ice-highlight">
          Drop CSV Files Here
        </p>
        <p className="text-caption text-muted-foreground">
          Add files for several accounts at once. All of them are imported, or
          none are.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            // Lets the same file be chosen again after it's removed.
            event.target.value = "";
          }}
        />
        <OutlineButton disabled={busy} onClick={() => input.current?.click()}>
          Choose Files
        </OutlineButton>
      </div>

      {files.length > 0 && (
        <ChosenFiles files={files} busy={busy} onRemove={onRemove} />
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-muted-foreground tabular-nums">
          {sizeText(files.map((file) => file.size))}
        </span>
        <Button
          type="button"
          className="h-9"
          disabled={files.length === 0 || busy}
          onClick={onImport}>
          {busy ? "Importing..." : "Import"}
        </Button>
      </div>
    </Card>
  );
}

function Count({
  label,
  value,
  lead = false,
}: {
  label: string;
  value: number;
  lead?: boolean;
}) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-2 text-heading font-medium tabular-nums",
          lead ? "text-ice-highlight" : "text-foreground",
        )}>
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}

export function ImportFinished({
  summary,
  fileCount,
  onImportMore,
}: {
  summary: ImportSummary;
  fileCount: number;
  onImportMore: () => void;
}) {
  const files = fileCount === 1 ? "1 file" : `${fileCount} files`;

  return (
    <Card
      role="group"
      aria-label="Import result"
      className="flex flex-col gap-8 p-6">
      <div className="space-y-1">
        <h2 className="text-body font-medium text-ice-highlight">
          Import Finished
        </h2>
        <p className="text-body-sm text-muted-foreground">
          Imported {files}. Nothing was overwritten.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
        <Count label="New" value={summary.newRows} lead />
        <Count label="Skipped" value={summary.skippedRows} />
        <Count label="Possible Duplicates" value={summary.possibleDuplicates} />
        <Count label="Ignored Pending" value={summary.ignoredPending} />
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OutlineButton onClick={onImportMore}>Import More Files</OutlineButton>
        <Button asChild className="h-9">
          <Link href={REVIEW_PATH}>Go to Review Inbox</Link>
        </Button>
      </div>
    </Card>
  );
}

function LaptopOnly() {
  return (
    <div className="-mx-4 flex flex-col gap-8 md:hidden">
      <h1 className="font-display text-heading font-medium text-ice-highlight">
        Import
      </h1>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <IconTile icon={Laptop} />
        <p className="text-body-sm font-medium text-ice-highlight">
          Import Works on a Laptop
        </p>
        <p className="text-caption text-muted-foreground">
          Open Budget Builder on a laptop to add CSV files. You can review rows
          here.
        </p>
        <Button
          asChild
          variant="ghost"
          className="h-11 text-foreground shadow-hairline">
          <Link href={REVIEW_PATH}>Go to Review Inbox</Link>
        </Button>
      </div>
    </div>
  );
}

export function ImportScreen() {
  const [files, setFiles] = useState<File[]>([]);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const { pending, run } = useServerAction();

  function add(added: readonly File[]) {
    setNotice(null);
    setFiles((current) => addFiles(current, added));
  }

  function remove(file: File) {
    setNotice(null);
    setFiles((current) => current.filter((chosen) => chosen !== file));
  }

  function startImport() {
    const refusal = uploadRefusal(files.map((file) => file.size));
    if (refusal !== null) {
      setNotice({ tone: "error", text: refusal });
      return;
    }

    setNotice(null);
    const form = new FormData();
    for (const file of files) form.append(FILES_FIELD, file);

    run(
      () => importStatementsAction(form),
      (result) => {
        if (result.ok) setFinished(result);
        else setNotice({ tone: "error", text: result.message });
      },
    );
  }

  function importMore() {
    setFinished(null);
    setFiles([]);
  }

  return (
    <>
      <LaptopOnly />
      <div className="hidden md:block md:mx-auto md:w-full md:max-w-[760px]">
        <PageFrame title="Import" subtitle={SUBTITLE}>
          <Notice message={notice} />
          {finished === null ? (
            <ChooseFiles
              files={files}
              busy={pending}
              onAdd={add}
              onRemove={remove}
              onImport={startImport}
            />
          ) : (
            <ImportFinished
              summary={finished.summary}
              fileCount={finished.fileCount}
              onImportMore={importMore}
            />
          )}
        </PageFrame>
      </div>
    </>
  );
}
