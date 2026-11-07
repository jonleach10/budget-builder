/** What a row is called on screen: the Transactions and Budget lists share it. */
export type RowTitle = {
  /** The owner's label if the row has one, otherwise the bank text. */
  title: string;
  /** The bank text, when a label took its place as the title. */
  bankText: string | null;
};

/**
 * A label that's empty once trimmed counts as no label, so the bank text stays
 * the title. The label lives in `note`; the bank text is `description`.
 */
export function rowTitle({
  note,
  description,
}: {
  note: string | null;
  description: string;
}): RowTitle {
  const label = note?.trim() || null;
  return label === null
    ? { title: description, bankText: null }
    : { title: label, bankText: description };
}
