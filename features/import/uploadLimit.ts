/**
 * In decimal on purpose. Next refuses a server action over 1,048,576 bytes, so
 * this leaves room for the form's wrapping around the files, and a set the
 * screen allows can't be refused by Next instead.
 */
export const MAX_UPLOAD_BYTES = 1_000_000;

/** The form field that carries the files. */
export const FILES_FIELD = "files";

const BYTES_PER_KB = 1000;
const KB_PER_MB = 1000;
const BYTES_PER_TENTH_MB = 100_000;

/** Rounds up, so a set over the limit never reads as equal to it. */
export function formatSize(bytes: number): string {
  const kb = Math.ceil(bytes / BYTES_PER_KB);
  if (kb < KB_PER_MB) return `${kb} KB`;
  return `${Math.ceil(bytes / BYTES_PER_TENTH_MB) / 10} MB`;
}

function totalSize(sizes: readonly number[]): number {
  return sizes.reduce((total, size) => total + size, 0);
}

export function sizeText(sizes: readonly number[]): string {
  return `${formatSize(totalSize(sizes))} of ${formatSize(MAX_UPLOAD_BYTES)}`;
}

type ChosenFile = { name: string; size: number };

function isSameFile(one: ChosenFile, other: ChosenFile): boolean {
  return one.name === other.name && one.size === other.size;
}

/** Adds files to a list, keeping one copy of a file chosen twice. */
export function addFiles<File extends ChosenFile>(
  current: readonly File[],
  added: readonly File[],
): File[] {
  return added.reduce(
    (files, file) =>
      files.some((chosen) => isSameFile(chosen, file))
        ? files
        : [...files, file],
    [...current],
  );
}

/** Why a set of files can't be sent, or null if it can. */
export function uploadRefusal(sizes: readonly number[]): string | null {
  const total = totalSize(sizes);
  if (total <= MAX_UPLOAD_BYTES) return null;

  return `These files total ${formatSize(total)}, and the limit is ${formatSize(MAX_UPLOAD_BYTES)}. Nothing was sent. Import fewer files at once.`;
}
