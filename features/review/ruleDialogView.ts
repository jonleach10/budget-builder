import type { MatchOn } from "@/features/categorize/matchRule";
import {
  isIdRule,
  MATCH_OPTIONS,
  ruleFromForm,
  rulesScreen,
  TYPE_OPTIONS,
  validateRule,
  type RuleForm,
  type RuleItem,
} from "@/features/rules/rules";
import { rowsText } from "./reviewInbox";
import {
  isNoMerchant,
  ruleConflict,
  rowsRuleWouldSort,
  type InboxRuleOffer,
  type SortCandidate,
} from "./ruleFromCorrection";

const PREVIEW_ROWS = 5;

export type PreviewRow = Pick<
  SortCandidate,
  "id" | "date" | "description" | "account" | "amount"
>;

/** The "Also sort" step: what the rule would sort now, if anything. */
export type SortSummary = {
  count: number;
  checkLabel: string;
  /** The inbox groups the rows are in, and the countries when both appear. */
  detail: string;
  bothCountries: boolean;
  /** The first rows, for Show Rows. */
  preview: PreviewRow[];
  more: string | null;
};

export type RuleDialogView =
  | { kind: "new"; sort: SortSummary | null }
  | {
      kind: "earlier";
      ruleId: string;
      matchLabel: string;
      value: string;
      typeLabel: string;
      category: string | null;
    }
  | {
      kind: "exists";
      ruleId: string;
      text: string;
      /** The button that sorts with the stored rule, when rows match it. */
      sortLabel: string | null;
      sort: SortSummary | null;
    };

/** A stored rule from the offer as the Edit Rule dialog takes it. */
export function storedRuleItem(
  offer: InboxRuleOffer,
  categories: readonly { id: string; name: string }[],
  ruleId: string,
): RuleItem | null {
  const { idRules, textRules } = rulesScreen(offer.rules, categories);
  return [...idRules, ...textRules].find(({ id }) => id === ruleId) ?? null;
}

/** The notice's text after the bank text, which the screen sets in mono. */
export function offerText({ count }: Pick<InboxRuleOffer, "count">): string {
  return `saved for ${rowsText(count)}. Add a rule so future imports do the same?`;
}

/** The hint under Value. The code hint shows only when the offer came from one. */
export function valueHint(matchOn: string, codeInText: boolean): string {
  if (isIdRule({ match_on: matchOn as MatchOn })) return "An ID must match exactly.";
  return codeInText
    ? "Shorten the text so later purchases match. Case doesn't matter."
    : "Case doesn't matter. Shorten the text to match more rows.";
}

function counted(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/**
 * Where the rows are in the inbox: each merchant key is one group under
 * Merchants, whether the key is bank text or an ID, and a row with no key is
 * under No Merchant. A code in each row's text makes each its own group.
 */
function sourcesText(rows: readonly SortCandidate[]): string {
  const groups = new Set(rows.filter((row) => !isNoMerchant(row)).map(({ merchant }) => merchant)).size;
  const loose = rows.filter(isNoMerchant).length;
  const parts = [
    ...(groups > 0 ? [counted(groups, "merchant group", "merchant groups")] : []),
    ...(loose > 0 ? [counted(loose, "No Merchant row", "No Merchant rows")] : []),
  ];
  return parts.join(" and ");
}

function summaryOf(rows: readonly SortCandidate[]): SortSummary | null {
  if (rows.length === 0) return null;

  const from = sourcesText(rows);
  const us = rows.filter(({ country }) => country === "US").length;
  const de = rows.length - us;
  const bothCountries = us > 0 && de > 0;
  const detail = bothCountries
    ? `From ${from}: ${rowsText(us)} in US accounts and ${de.toLocaleString("en-US")} in Germany.`
    : `From ${from}, all in ${us > 0 ? "US" : "German"} accounts.`;
  const extra = rows.length - PREVIEW_ROWS;

  return {
    count: rows.length,
    checkLabel: `Also sort ${rowsText(rows.length)} in review`,
    detail,
    bothCountries,
    preview: rows
      .slice(0, PREVIEW_ROWS)
      .map(({ id, date, description, account, amount }) => ({
        id,
        date,
        description,
        account,
        amount,
      })),
    more: extra > 0 ? `And ${extra.toLocaleString("en-US")} more.` : null,
  };
}

function labelOf(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * What the Add Rule dialog shows for the form as it is now: the count of rows
 * the rule would sort, an earlier rule that decides the source row first, or a
 * stored rule that's the same. Worked out as the server works it out on save.
 */
export function ruleDialogView(
  offer: InboxRuleOffer,
  form: RuleForm,
  categories: readonly { id: string; name: string }[] = [],
): RuleDialogView {
  const check = validateRule(ruleFromForm(form));
  if (!check.ok) return { kind: "new", sort: null };

  const conflict = ruleConflict(check.rule, offer.rules, offer.source);
  if (conflict === null) {
    return {
      kind: "new",
      sort: summaryOf(rowsRuleWouldSort(check.rule, offer.rules, offer.candidates)),
    };
  }

  const { rule } = conflict;
  if (conflict.kind === "earlier") {
    return {
      kind: "earlier",
      ruleId: rule.id,
      matchLabel: labelOf(MATCH_OPTIONS, rule.match_on),
      value: rule.value,
      typeLabel: labelOf(TYPE_OPTIONS, rule.category_id === null ? (rule.type ?? "spending") : "spending"),
      category:
        rule.category_id === null
          ? null
          : (categories.find(({ id }) => id === rule.category_id)?.name ?? null),
    };
  }

  const sort = summaryOf(rowsRuleWouldSort(rule, offer.rules, offer.candidates));
  const exists = "This rule already exists, so it won't be added again.";
  if (sort === null) return { kind: "exists", ruleId: rule.id, text: exists, sortLabel: null, sort };

  const matching =
    sort.count === 1
      ? "1 row that matches it is still in review"
      : `${rowsText(sort.count)} that match it are still in review`;
  return {
    kind: "exists",
    ruleId: rule.id,
    text: `${exists} A rule sorts only rows imported after it, so ${matching}.`,
    sortLabel: sort.count === 1 ? "Sort 1 Row" : `Sort ${sort.count.toLocaleString("en-US")} Rows`,
    sort,
  };
}
