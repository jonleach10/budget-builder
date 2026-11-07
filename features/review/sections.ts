/** The inbox's places. Possible transfers and duplicates join them in #53. */
export type ReviewSection = "merchants" | "no-merchant";

export const SECTIONS: readonly { value: ReviewSection; label: string }[] = [
  { value: "merchants", label: "Merchants" },
  { value: "no-merchant", label: "No Merchant" },
];

/** The section lives in the address, so a link or a reload keeps it. */
export function readReviewSection(
  params: Readonly<Record<string, string | string[] | undefined>>,
): ReviewSection {
  return params.section === "no-merchant" ? "no-merchant" : "merchants";
}

export function sectionHref(section: ReviewSection): string {
  return section === "merchants"
    ? "/review"
    : `/review?${new URLSearchParams({ section })}`;
}
