type SearchParams = Record<string, string | string[] | undefined>;

/** The account in the address, if there's exactly one. The period joins it later. */
export function readAccountParam(params: SearchParams): string | null {
  const { account } = params;
  return typeof account === "string" && account !== "" ? account : null;
}

export function accountHref(accountId: string): string {
  return `/accounts?${new URLSearchParams({ account: accountId })}`;
}
