/** The inbox's places, one tab each. */
export type ReviewSection = "merchants" | "no-merchant" | "transfers" | "duplicates";

export const SECTIONS: readonly {
  value: ReviewSection;
  label: string;
  /** The phone's tabs sit two to a row, so the long labels shorten. */
  phoneLabel: string;
}[] = [
  { value: "merchants", label: "Merchants", phoneLabel: "Merchants" },
  { value: "no-merchant", label: "No Merchant", phoneLabel: "No Merchant" },
  { value: "transfers", label: "Possible Transfers", phoneLabel: "Transfers" },
  { value: "duplicates", label: "Possible Duplicates", phoneLabel: "Duplicates" },
];

/** The section lives in the address, so a link or a reload keeps it. */
export function readReviewSection(
  params: Readonly<Record<string, string | string[] | undefined>>,
): ReviewSection {
  const found = SECTIONS.find(({ value }) => value === params.section);
  return found === undefined ? "merchants" : found.value;
}

export function sectionHref(section: ReviewSection): string {
  return section === "merchants"
    ? "/review"
    : `/review?${new URLSearchParams({ section })}`;
}
