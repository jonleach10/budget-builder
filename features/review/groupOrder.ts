import type { MerchantGroup } from "./reviewInbox";

/** Where the open group sat in the list, largest first, when it was opened. */
export type OpenPlace = { key: string; index: number };

/**
 * The inbox's groups, largest first, with the open group held where it was
 * opened. A save can drop its count, and moving it then would take it out of
 * view. With no group open, or once it's gone, the order is largest first.
 */
export function keepOpenInPlace(
  groups: readonly MerchantGroup[],
  place: OpenPlace | null,
): MerchantGroup[] {
  const open =
    place === null ? undefined : groups.find(({ key }) => key === place.key);
  if (place === null || open === undefined) return [...groups];

  const rest = groups.filter((group) => group !== open);
  const index = Math.min(Math.max(place.index, 0), rest.length);
  return [...rest.slice(0, index), open, ...rest.slice(index)];
}
