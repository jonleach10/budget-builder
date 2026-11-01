import type { CategoryRule } from "@/features/categorize/findCategory";
import type { MatchingRule } from "@/features/categorize/findType";
import type { MatchOn } from "@/features/categorize/matchRule";
import type { TransactionType } from "@/features/categorize/transactionType";
import { inPositionOrder } from "@/lib/ordering";

/** A row of the rules table. It gives a type or a category, never both. */
export type RuleRow = {
  id: string;
  match_on: MatchOn;
  value: string;
  position: number;
  type: TransactionType | null;
  category_id: string | null;
};

type NamedCategory = { id: string; name: string };

/** What the rule form holds, in the order the owner chooses it. */
export type RuleForm = {
  matchOn: string;
  value: string;
  type: string;
  categoryId: string;
};

/** A rule on its way to being stored, before anything has checked it. */
export type RuleDraft = {
  match_on: string;
  value: string;
  type: string | null;
  category_id: string | null;
};

export type ValidRule = Pick<
  RuleRow,
  "match_on" | "value" | "type" | "category_id"
>;

export type RuleCheck =
  | { ok: true; rule: ValidRule }
  | { ok: false; message: string };

export const MATCH_OPTIONS: readonly { value: MatchOn; label: string }[] = [
  { value: "descriptionStartsWith", label: "Starts With" },
  { value: "descriptionContains", label: "Contains" },
  { value: "ppdId", label: "PPD ID" },
  { value: "orderingPartyId", label: "Ordering Party ID" },
];

export const TYPE_OPTIONS: readonly {
  value: TransactionType;
  label: string;
}[] = [
  { value: "spending", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "saved", label: "Saved" },
  { value: "personal", label: "Personal" },
];

export const EMPTY_RULE_FORM: RuleForm = {
  matchOn: "descriptionStartsWith",
  value: "",
  type: "spending",
  categoryId: "",
};

function isMatchOn(value: string): value is MatchOn {
  return MATCH_OPTIONS.some((option) => option.value === value);
}

function isTransactionType(value: string): value is TransactionType {
  return TYPE_OPTIONS.some((option) => option.value === value);
}

/** Matches firstMatchingRule, which tries these before any text rule. */
export function isIdRule(rule: Pick<RuleRow, "match_on">): boolean {
  return rule.match_on === "ppdId" || rule.match_on === "orderingPartyId";
}

/** A rule with a category sets the type too, so one rule does both jobs. */
function typeGivenBy(row: RuleRow): TransactionType | null {
  return row.category_id === null ? row.type : "spending";
}

export function toMatchingRules(rows: readonly RuleRow[]): MatchingRule[] {
  return inPositionOrder(rows).flatMap((row) => {
    const type = typeGivenBy(row);
    return type === null
      ? []
      : [{ matchOn: row.match_on, value: row.value, type }];
  });
}

export function toCategoryRules(
  rows: readonly RuleRow[],
  categories: readonly NamedCategory[],
): CategoryRule[] {
  const names = new Map(categories.map(({ id, name }) => [id, name]));

  return inPositionOrder(rows).flatMap((row) => {
    const category = names.get(row.category_id ?? "");
    return category === undefined
      ? []
      : [{ matchOn: row.match_on, value: row.value, category }];
  });
}

/** Spending with a category is a category rule. Anything else is a type rule. */
export function ruleFromForm(form: RuleForm): RuleDraft {
  const hasCategory = form.type === "spending" && form.categoryId !== "";

  return {
    match_on: form.matchOn,
    value: form.value,
    type: hasCategory ? null : form.type,
    category_id: hasCategory ? form.categoryId : null,
  };
}

/**
 * trim() removes exactly what the schema's filled_text check calls blank. An ID
 * loses every space, because the adapters store IDs without any and a value
 * copied from a bank file can hold one where the booking text wrapped.
 */
export function validateRule(draft: RuleDraft): RuleCheck {
  const { match_on, type, category_id } = draft;

  if (draft.value.trim() === "") return { ok: false, message: "Enter a value." };
  if (!isMatchOn(match_on)) {
    return { ok: false, message: "Select what this rule matches." };
  }
  const value = isIdRule({ match_on })
    ? draft.value.replace(/\s/g, "")
    : draft.value.trim();

  if (type !== null && category_id !== null) {
    return { ok: false, message: "Select a type or a category, not both." };
  }
  if (category_id !== null) {
    return { ok: true, rule: { match_on, value, type: null, category_id } };
  }
  if (type === null || !isTransactionType(type)) {
    return { ok: false, message: "Select a type." };
  }
  return { ok: true, rule: { match_on, value, type, category_id } };
}

function labelOf(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** One rule as the Rules screen shows it. */
export type RuleItem = {
  id: string;
  value: string;
  matchLabel: string;
  typeLabel: string;
  category: string | null;
  form: RuleForm;
};

function toItem(row: RuleRow, names: ReadonlyMap<string, string>): RuleItem {
  const type = typeGivenBy(row) ?? "spending";
  const category = names.get(row.category_id ?? "") ?? null;

  return {
    id: row.id,
    value: row.value,
    matchLabel: labelOf(MATCH_OPTIONS, row.match_on),
    typeLabel: labelOf(TYPE_OPTIONS, type),
    category,
    form: {
      matchOn: row.match_on,
      value: row.value,
      type,
      categoryId: category === null ? "" : (row.category_id ?? ""),
    },
  };
}

export type RulesScreenData = {
  idRules: RuleItem[];
  textRules: RuleItem[];
  categories: NamedCategory[];
};

/** ID rules are always tried first, so they're shown first, in their own group. */
export function rulesScreen(
  rows: readonly RuleRow[],
  categories: readonly NamedCategory[],
): RulesScreenData {
  const names = new Map(categories.map(({ id, name }) => [id, name]));
  const ordered = inPositionOrder(rows);

  return {
    idRules: ordered.filter(isIdRule).map((row) => toItem(row, names)),
    textRules: ordered
      .filter((row) => !isIdRule(row))
      .map((row) => toItem(row, names)),
    categories: [...categories],
  };
}
