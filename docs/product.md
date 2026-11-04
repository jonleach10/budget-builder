# Budget Builder

A budget for joint money held at two banks, in two countries and two currencies.

## The problem

Joint money sits in Chase accounts in the US and Commerzbank accounts in Germany. Each bank shows only its own accounts, in its own format and currency. Moves between our own accounts and credit card payments also look like spending until something tells them apart. So there's no single answer to what we spent this month against what we planned.

## Who it's for

One owner, who is the only login. There's no signup and no shared access.

It's also a portfolio project. The code is public, and a demo on fake data will let anyone try it without touching real data. When the two conflict, daily use wins.

## What it does

- **Import.** The owner exports CSV files from each bank, about weekly, and imports them on a laptop. Overlapping date ranges are fine, because rows already seen are skipped. A file that can't be read stores nothing.
- **Sort.** Each row gets a type: spending, income, transfer, saved or personal. Only spending counts against a budget.
- **Categorize.** A row's category comes from the first match: the owner's own choice, a saved rule, a past category for that merchant, then the bank's type. Bank categories only feed suggestions.
- **Review.** Rows with no answer wait in the Review inbox, grouped by merchant, largest group first. They stay out of category totals until the owner decides. A suggestion never applies itself.
- **Budget.** Each category has a fixed monthly amount, set per country, with no rollover. A new month copies the nearest budgeted month.
- **Report.** Overview shows the US, Germany and Combined views with a 12-month trend. The owner checks these on a phone.
- **Back up.** One button on Settings downloads a single file holding a readable CSV for every table and an exact copy for restoring. A backup that would leave rows out fails instead. Settings shows when a backup was last tried and when one last worked.
- **Delete.** Delete All Data clears transactions, rules, budget amounts and FX rates, all of it or none of it, after the owner types `DELETE` and enters a fresh MFA code. Accounts, categories, settings and the login stay, so the owner can import again straight away.
- **Restore.** A script in the repo loads a backup into a new Supabase project. It refuses a project that already holds rows.

Screens: Overview, Budget, Transactions, Review Inbox, Import, Rules and Settings.

## How money is counted

- There's a USD budget for the US accounts, a EUR budget for the German accounts, and a combined view in USD.
- EUR converts to USD at the saved European Central Bank rate for the posting date, or the previous business day. The rate stays with the row, so past months never change.
- EUR budget amounts convert at the first-of-month rate.
- A foreign purchase keeps the amount charged, with the original amount shown under it.
- Moves between our own accounts are transfers. Every card payment is excluded.
- Personal purchases sit in one bucket and don't count against the budget.
- Savings and brokerage contributions show as money saved.
- Income is tracked and shown with net saved, but not budgeted.
- Refunds reduce their category in the month they post.
- Months are calendar months by posting date. Pending rows are ignored.

The budget covers joint money only. Personal accounts are never imported, so income shows only what reaches joint money.

## What it keeps

- Only cleaned fields: date, amount, merchant or recipient, payment purpose, original amount and rate, and a one-way fingerprint for each row.
- CSV files and raw bank text are discarded after parsing, and full IBANs are removed.
- Bank date and amount can't be edited, and a re-import never overwrites an edit.
- Every table has row-level security, and sign-in needs MFA.
- No transaction data goes to AI services or analytics.
- The database makes no automatic backups. Backups are the owner's own files, kept on their Mac and never in the repo. Deleting data in the app doesn't touch them.

## The first version

It's done when:

- A full month from every joint account imports.
- Every transaction is categorized.
- Budget against actual shows in one currency.
- A fake-data demo is available.

Not in the first version: AI, alerts, recurring-bill detection, split transactions, manual cash entries, shared access, savings goals, debt or investment tracking, moving a purchase between country budgets, scheduled backups, and restoring inside the app.

CSV is the only import for now, with room for a sync source later.
