# Budget Builder

A budget for one owner's joint money, held in Chase accounts in the US and Commerzbank accounts in Germany. Bank statements come in, every row gets a type and, if it's spending, a category, and the months are compared against a US budget, a Germany budget and a Combined view in USD.

Each term is the word the screens show. Where the code or the database uses another name, it's under "In code". Nothing is renamed to match this file.

## Rows

**Transaction type**:
What a row is: Spending, Income, Transfer, Saved or Personal. Only Spending counts against a budget, and only Spending holds a category.
_Avoid_: kind, class
_In code_: `type` in the database and `TransactionType`, with the values `spending`, `income`, `transfer`, `saved` and `personal`.

**Personal**:
The transaction type for a personal purchase made from joint money. Personal rows sit in one bucket and never count against a budget.
_Avoid_: Personal allowance, which is a category

**Personal allowance**:
A Spending category, used for rows such as a transfer to a personal account. It counts against the budget like any other category.
_Avoid_: Personal, which is a transaction type

**Label**:
The owner's own text for a row. It takes the bank text's place as the row's name, with the bank text still shown under it, and it changes no figure, rule or fingerprint.
_Avoid_: note, title, memo
_In code_: `label` in the edit form, `note` in the database, and `title` in the screen model (`rowTitle`).

**Hidden**:
A row the owner took out of every total. It never needs review, and Transactions shows it only with Show Hidden.
_Avoid_: deleted, excluded
_In code_: `hidden`.

**Posted date**:
The date the bank booked a row. It decides the row's month and its locked rate, and it's the date the screens show.
_Avoid_: booking date, transaction date
_In code_: `posted_on`, `postedOn`.

**Purchase date**:
The date of the purchase itself, when the statement gives one. It's kept with the row but decides nothing.
_Avoid_: transaction date
_In code_: `purchased_on`, `purchasedOn`.

**Month**:
A calendar month, by posted date. Budgets are set per month, with no rollover.
_In code_: `YYYY-MM` text, such as the `month` column of `budget_amounts`.

## Accounts

**Account**:
A bank account the owner imports from: a Chase checking, savings or card account, or a Commerzbank account. Each has one currency and belongs to one country, and the screens name it with its last four digits, such as "Ending 2222".
_Avoid_: card (for an account in general), wallet
_In code_: the `accounts` table, `AccountRecord`, and `account_id` on each row.

**Account page**:
The screen that shows one account's Spending by category over a period, in the account's own currency with no conversion. Its title is Accounts, matching the sidebar, and a picker at the top chooses the account.
_Avoid_: Accounts page, account view
_In code_: `/accounts`, `features/accounts/`, `buildAccountScreen`.

**Period**:
The continuous run of months the Account page covers, from a From month to a To month. The shortcuts are This Month, the month in progress; Last 3 Months and Last 12 Months, which end at the last full month so a partial month never drags them down; and All Months, from the account's first month with rows to its last. Last 3 Months is the default.
_Avoid_: date range, timeframe
_In code_: `PeriodChoice`, `MonthRange`, and `from`, `to` and `period=all` in the address.

**Change**:
How a category's Spending in the period compares with the same number of months before it, as a percentage. "New" means it had no Spending then. All Months has nothing before it, so it has no Change.
_Avoid_: delta, trend (the trend is the monthly chart)
_In code_: `change` on `CategoryLine`, `comparisonRange`.

**Slice**:
A category's part of the Account page's donut. Only a category with Spending above $0 in the period gets one; a category at $0 or below, because its Spending stopped or refunds outweighed it, is listed muted under the slices with no slice. A slice's colour comes from its place in the list, not from its category, so the same category can change colour between periods. The figure in the middle is the sum of the slices.
_Avoid_: segment, wedge
_In code_: `layoutDonut`, `SliceColor`, `swatch` on `CategoryLine`.

**Share**:
A category's Spending as a part of the sum of the slices, worked out in minor units and rounded only for display, so the shown shares may not add up to exactly 100%. The Total row says 100% whenever the Total is above $0.
_Avoid_: percentage (Change is a percentage too)
_In code_: `share` on `CategoryLine`.

**Other**:
The donut's last slice when the period has more than 7 categories with Spending: the top 6 get a slice each and the rest are grouped into Other, which the legend lists one by one under it. With 7 or fewer there's no Other. Only Other's slice is hatched.
_Avoid_: miscellaneous, the rest
_In code_: the `other` key and `members` on `CategoryLine`.

**Visits**:
One Spending row at a merchant. The Account page's Top Merchants gives each merchant's visits in the period beside its total, so a few large payments can be told from many small ones. A refund is a Spending row, so it's a visit too.
_Avoid_: purchases, transactions
_In code_: `visits` and `visitsText` on `MerchantLine`.

**Trend**:
The Account page's Monthly Spending chart: the account's Spending in each month of the period. One month alone shows the 12 months up to it, with it highlighted. A month whose rows all need review has no figure yet, so it's a hollow point, not $0. The card is hidden when every month in it is $0.
_Avoid_: history, sparkline
_In code_: `SpendingTrend`, `buildSpendingTrend`, `trend` on `ReadyAccount`.

## Statements and import

**Statement**:
One account's rows as its bank exports them, in a format Budget Builder reads: Chase bank, Chase card or Commerzbank. The Import screen asks for them as CSV files.
_Avoid_: file, CSV (in domain text)
_In code_: `StatementSource`, `ParsedStatement`, and `StatementFormat` with the values `chase-bank`, `chase-card` and `commerzbank`.

**Adapter**:
The code for one statement format. It recognizes the format by its header row and turns its rows into cleaned rows.
_Avoid_: parser, importer
_In code_: `StatementAdapter`, in `features/import/adapters/`.

**Bank type**:
The bank's own label for what kind of row it is, shown as Bank Type. Some bank types give a row its transaction type or its category.
_In code_: `bank_type`, `bankType`.

**Bank category**:
The bank's own category for a row, shown as Bank Category. It only ever feeds a suggestion, because banks sometimes get it wrong.
_Avoid_: Category, which is the owner's
_In code_: `bank_category`, `bankCategory`.

**Fingerprint**:
A one-way hash that identifies a stored row, so the same row in an overlapping statement is skipped. It's built from the account, posted date, amount, cleaned bank text, and how many identical rows came before it in its statement.
_Avoid_: hash, row ID
_In code_: `fingerprint`, with a `v1:` prefix.

**Possible duplicate**:
A row identical to an earlier row in the same statement, flagged at import. It counts in totals until the owner hides it, and the Possible Duplicates tab lists it until it's dismissed or hidden.
_Avoid_: duplicate, which claims more than anyone knows
_In code_: `possible_duplicate`, set when `repeatIndex` is above zero.

## Categories and review

**Category**:
The budget line a Spending row counts against. Categories are shared by both country budgets. A row's category comes from the first that gives one: the owner's choice, a rule, a past category for the merchant, then the bank type.
_Avoid_: Bank category, bucket
_In code_: `category_id`, and the `categories` table.

**Suggestion**:
A category offered for a row in review, from a category the owner confirmed for the same merchant or from the bank category. It never applies itself: the row stays in review until the owner accepts it or picks another.
_Avoid_: Category, auto-category
_In code_: `suggested_category_id`, `Suggestion`. The screens show it as "Suggested:".

**Category source**:
Where a row's category came from: manual (the owner's choice, the only one that counts as confirmed), rule, past category (a category the owner confirmed for the same merchant), or bank type. The screens don't show it.
_Avoid_: history
_In code_: `category_source`, `CategorySource`, with the values `manual`, `rule`, `history` for a past category, and `bank-type`.

**Rule**:
An owner-made match that gives a row a transaction type or a category at import. An ID rule matches a PPD ID or an Ordering Party ID and is always tried first. A text rule matches bank text with Starts With or Contains. The first match wins, a rule with a category also makes the row Spending, and a Spending rule with no category sends the row to review.
_In code_: the `rules` table, with `match_on` values `ppdId`, `orderingPartyId`, `descriptionStartsWith` and `descriptionContains`.

**Merchant key**:
What a merchant's rows share: the PPD ID, else the Ordering Party ID, else the bank text ignoring case. Past categories and the Review inbox's merchant groups go by it. A row with no key is listed under No Merchant.
_Avoid_: merchant ID, payee
_In code_: `merchantKey`, with `ppdId:`, `orderingPartyId:` and `description:` prefixes. It's worked out from stored fields and never stored.

**Redacted merchant key**:
The merchant key a row with redacted text gets, from the text left once the [REDACTED] placeholder is removed. A category the owner confirmed under it is only a suggestion, never a category on its own, because the removed number may have told two payees apart. A row holding only the placeholder has no key.
_In code_: a merchant key starting `redacted:`, and `isRedactedKey`.

**Needs review**:
A row that isn't hidden and has no transaction type, or is Spending with no category. It stays out of the budget totals until the owner decides.
_Avoid_: uncategorized, pending
_In code_: `needsReview`. In the database, a null `type`, or a `type` of `spending` with a null `category_id`.

**Review inbox**:
The page where the owner decides rows. It has four tabs: Merchants, for rows that need review grouped by merchant key, largest group first; No Merchant, for rows with no key; Possible Transfers; and Possible Duplicates.
_Avoid_: queue, triage
_In code_: `/review`, `features/review/`, `ReviewInbox`.

## Transfers

**Transfer pair**:
Two rows that are one transfer: the same amount going out of one of the owner's accounts and into another, in the same currency. Import pairs rows that share a transfer number, and a card payment with its one matching bank row. The owner confirms other matches in Possible Transfers, and changing either row's type removes the pair from both.
_Avoid_: matched transfer, linked rows
_In code_: `transfer_pair_id`, `TransferPair`, with `moneyOut` and `moneyIn`.

**Card payment**:
A payment from a bank account to a Chase card, which appears on both statements. Unless a rule says otherwise, import makes it a Transfer: paired with its bank row when exactly one matches within five days, and a Transfer on its own when none does. When more than one bank row could match, it waits in Possible Transfers.
_Avoid_: bill payment
_In code_: a `chase-card` row whose bank type marks a payment, with the evidence `card-payment`.

## Budgets and money

**Country budget**:
A month's budget for one country, in its currency: US in USD for the US accounts, and Germany in EUR for the German accounts. Every row belongs to its account's country, and amounts are set per category.
_Avoid_: DE, USD budget, EUR budget
_In code_: `Country`, with `US` and `DE`; the budget views `us` and `germany`; and the `country` column of `accounts` and `budget_amounts`.

**Combined view**:
The read-only view that adds both country budgets together in USD. Germany's budget amounts convert at the first-of-month rate, and each row uses its locked USD amount.
_Avoid_: total view, combined budget
_In code_: the budget view `combined`.

**Base currency**:
The currency of the Combined view and of every row's locked amount. It's USD, and Settings shows it with no way to change it.
_In code_: `base_currency`, `BASE_CURRENCY`.

**Locked rate**:
The EUR to USD rate a row gets at import, saved on the row with the USD amount it gives. It never changes, so past months never change. A USD row stores a rate of 1. The screens call it the row's saved rate.
_Avoid_: current rate, today's rate
_In code_: `base_rate`, with `base_amount_minor`.

**First-of-month rate**:
The saved ECB rate for the first day of a month, or the latest one in the seven days before it. The Combined view converts Germany's budget amounts at it.
_In code_: `findRate` for the date `${month}-01`.

**Net saved**:
The month's Income minus its Spending, shown on Overview. It can be negative.
_Avoid_: Money saved, savings
_In code_: `netSaved`.

**Money saved**:
The total of the month's rows of type Saved, shown on Overview.
_Avoid_: Net saved, savings
_In code_: `moneySaved`, from rows with the `type` `saved`.
