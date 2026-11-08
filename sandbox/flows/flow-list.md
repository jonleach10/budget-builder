# Flow list

Every user flow in Budget Builder, written as behavior. The launch check's features line runs each flow here, at phone and desktop widths, in the local sandbox. The sandbox flows in this folder automate some of them.

A flow names where it starts, what the user does, and what they should see. It names screens, buttons and messages as the screens show them. It never names a selector.

## Keeping it complete

The first two rules are also review criteria in `CLAUDE.md`, so a review checks them.

- A ticket that adds a screen, a route or a new way through a screen adds its flows here, in the same PR.
- A ticket that changes what a flow does or shows updates that flow.
- A screen the features line reaches that isn't on this list is reported as a missing flow.

## How to read a flow

- **Session**: who is logged in when the flow starts.
  - **Fake owner**: the sandbox's owner, with MFA, and its synthetic rows.
  - **Second user**: a second synthetic user with its own MFA and no rows. #118 adds it.
  - **Setup user**: a third synthetic user with a password, no authenticator and no rows, for MFA setup. #118 adds it. Reseed after AUTH-05, which gives it an authenticator.
  - **None**: no one is logged in.
- **Release**: when the flow has to pass.
  - **Go-live**: before the app goes live with the owner's data (#72).
  - **Before public launch**: before the public intro and demo go live (#79). These screens aren't built yet.
- **Changes**: what the flow stores. A run resets the rows after any flow that changes something. "Nothing" means the flow only reads.
- **Widths**: every flow runs at a phone width (390 wide) and a desktop width (1280 wide). Where the phone shows something different, the flow says so.
- **Automated in**: the sandbox flow file that already covers it, if one does.

Months in the sandbox: the seed fills the 12 months up to the current one. "Last month" means the month before the current one, which is complete.

## Routes and their flows

| Route | Screen | Flows |
| --- | --- | --- |
| `/login` | Log In to Budget Builder | AUTH-01, AUTH-02, AUTH-04, AUTH-05, AUTH-06, AUTH-08 |
| `/login/mfa` | Enter Code | AUTH-01, AUTH-03, AUTH-04, AUTH-07, AUTH-08 |
| `/login/mfa/setup` | Set Up Authenticator | AUTH-05, AUTH-07, AUTH-08 |
| `/` | Overview | AUTH-01, NAV-01, OVR-01 to OVR-04, EMPTY-01 |
| `/budget` | Budget | NAV-01, BUD-01 to BUD-07, EMPTY-01, EMPTY-02 |
| `/transactions` | Transactions | NAV-01, TXN-01 to TXN-08, EMPTY-01 |
| `/review` | Review Inbox | NAV-01, REV-01 to REV-11, EMPTY-01 |
| `/import` | Import | NAV-01, IMP-01 to IMP-05, EMPTY-01 |
| `/rules` | Rules | NAV-01, RUL-01 to RUL-06, EMPTY-01 |
| `/settings` | Settings | NAV-01, SET-01 to SET-05, EMPTY-01, EMPTY-02 |
| Any other address | None | NAV-02 |

Log out is AUTH-04 and AUTH-06. Routes the demo adds are under [Before public launch](#before-public-launch).

## Log in and log out

### AUTH-01 Log in with a code

- **Session**: Fake owner, logged out at the start.
- **Release**: Go-live.
- **Changes**: Nothing stored. Starts a session.
- **Start**: `/login`.

1. Enter the owner's email and password, then click Log In.
2. On Enter Code, enter the current 6-digit code from the authenticator, then click Verify Code.

**Result**: the Overview opens at `/`. The sidebar lists every screen.

### AUTH-02 Wrong password

- **Session**: None.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/login`.

1. Enter the owner's email and a wrong password, then click Log In.

**Result**: the page stays on Log In and shows "The email or password is incorrect. Check them and try again." The password field is empty.

### AUTH-03 Wrong code

- **Session**: Fake owner, logged out at the start.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/login`.

1. Log in with the owner's email and password.
2. On Enter Code, enter a wrong 6-digit code, then click Verify Code.

**Result**: the page stays on Enter Code and shows "That code is incorrect. Enter the current code from your authenticator app." The code field is empty. Entering the right code then opens the Overview.

### AUTH-04 Log out before the code

- **Session**: Fake owner, logged out at the start.
- **Release**: Go-live.
- **Changes**: Nothing stored. Ends the session.
- **Start**: `/login`.

1. Log in with the owner's email and password.
2. On Enter Code, click Log Out.
3. Go to `/budget`.

**Result**: step 2 opens Log In. Step 3 opens Log In too.

### AUTH-05 Set up the authenticator

- **Session**: Setup user, logged out at the start.
- **Release**: Go-live.
- **Changes**: adds a verified authenticator to the setup user.
- **Start**: `/login`.

1. Log in with the setup user's email and password.
2. Set Up Authenticator opens, with a QR code and a key to enter by hand.
3. Add the key to an authenticator, enter the 6-digit code it shows, then click Verify Code.
4. Log out, then log in again.

**Result**: step 3 opens the Overview. In step 4, the password now leads to Enter Code, not Set Up Authenticator. A wrong code at step 3 shows the same message as AUTH-03. Log Out on Set Up Authenticator opens Log In.

### AUTH-06 Log out from the sidebar

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing stored. Ends every session the fake owner has, on every device.
- **Start**: `/budget`, in a session logged in for this flow, not the saved one.

1. Click Log Out at the foot of the sidebar. On a phone, open the menu at the top left first.
2. Use the browser's Back button, then reload.

**Result**: step 1 opens Log In. Step 2 shows Log In, not Budget.

**Run this flow last.** Log Out signs out everywhere, by design (owner's decision, 2026-11-08): it ends every session the fake owner has, including the saved one the other flows use. Any fake-owner flow after it fails until the owner logs in again.

### AUTH-07 Pages a half-finished log in can't reach

- **Session**: Fake owner, logged out at the start.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/login`.

1. Log in with the owner's email and password, and stop at Enter Code.
2. Go to `/`, `/budget`, `/transactions`, `/review`, `/import`, `/rules`, `/settings` and `/login/mfa/setup` in turn.

**Result**: each address opens Enter Code at `/login/mfa`. No app screen shows.

### AUTH-08 Log-in pages once logged in, and app pages once logged out

- **Session**: Fake owner for steps 1 and 2. None for steps 3 and 4.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/login`, logged in.

1. Logged in, go to `/login`, `/login/mfa` and `/login/mfa/setup` in turn.
2. Each one opens the Overview at `/`.
3. Logged out, go to `/`, `/budget`, `/transactions`, `/review`, `/import`, `/rules`, `/settings`, `/login/mfa` and `/login/mfa/setup` in turn.
4. Each one opens Log In at `/login`.

**Result**: as in steps 2 and 4.

## Moving around

### NAV-01 The sidebar reaches every screen

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/`.
- **Automated in**: `screens.spec.ts` (each screen loads at both widths).

1. Click each sidebar item in turn: Overview, Budget, Transactions, Review Inbox, Import, Rules and Settings.
2. On a phone, open the menu at the top left before each click.
3. On a desktop, use Toggle Sidebar at the top of the sidebar to fold it to icons, then open it again.

**Result**: each item opens its screen, with a heading that names it, and marks itself as the current item. On a phone, the menu closes after each click. No screen scrolls sideways.

### NAV-02 An address that isn't a screen

- **Session**: Fake owner, then None.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/no-such-page`.

1. Logged in, go to `/no-such-page`.
2. Logged out, go to the same address.

**Result**: step 1 shows a page saying it can't be found. The app has no page of its own for this yet, so it's Next's default. Step 2 opens Log In.

## Overview

### OVR-01 Read the month

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/`.

1. Look at the current month in the US view.

**Result**: the Overview shows Budgeted, Spent and Remaining, a meter for how much is used, and Income, Net Saved and Money Saved. A line says how many rows need review and aren't in the budget totals, and it links to the Review Inbox. The 12-Month Trend shows a chart of Income and Spending ending at the current month. On a phone, Remaining comes first.

### OVR-02 Change the view and the month

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/`.

1. Click Germany, then Combined, then US.
2. Click Previous month twice, then Next month once.
3. Reload the page.

**Result**: Germany shows EUR. Combined shows USD, and its subtitle says budgets use the first-of-month rate and spending uses each row's saved rate. The month name changes with each click, and the figures change with it. The address keeps the month and the view, so the reload shows the same month and view.

### OVR-03 The trend as a table

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/`.

1. In 12-Month Trend, click Show Table.
2. Click Show Chart.

**Result**: step 1 swaps the chart for a table of Income and Spending by month. Step 2 brings the chart back. The table fits a phone with no sideways scroll of the page.

### OVR-04 Combined with no saved rate

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/`, with the address set to Combined and a month before the seeded 12 months.

1. Open Combined for that month.

**Result**: in place of the figures, a panel says Combined figures need a saved EUR rate for that month, and that rates are saved during import. US and Germany still show for that month.

## Budget

### BUD-01 Read the budget and open a category

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/budget`, last month, US view.
- **Automated in**: `budget.spec.ts`.

1. Click Groceries.
2. Click Groceries again.

**Result**: the table lists each category with Budgeted, Spent, Remaining and a Used meter, and a Total row. Step 1 shows Groceries' rows under it, each with its date, description, account and amount. A row with a label shows the label, with its bank text under it. Step 2 hides them. On a phone, categories are cards, Totals sit above them, and the rows are a list.

### BUD-02 Change an amount and save

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one budget amount, for that category, month and country.
- **Start**: `/budget`, current month, US view.

1. Change the amount for Dining.
2. Click Save Budget.
3. Reload the page.

**Result**: a notice says "Budget saved." Dining's Remaining and the Total change to match. The reload keeps the new amount. The Overview for the same month shows the new Budgeted total.

### BUD-03 An amount that can't be saved

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/budget`, current month, US view.

1. Enter `abc` for one category and `-5` for another.
2. Click Save Budget.

**Result**: under each field, an error asks for a valid amount: "Enter an amount such as 450.00." and "Enter an amount of 0.00 or more." Nothing is saved. A reload shows the old amounts.

### BUD-04 Copy a month's amounts

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: adds the US budget amounts for next month, copied from the current month.
- **Start**: `/budget`, current month, US view.

1. Click Next month.
2. A panel says there's no budget for that month and offers to copy the current month. Click its Copy button.

**Result**: a notice says the amounts were copied from the current month. The table shows the copied amounts. Germany for next month still offers its own copy.

### BUD-05 Germany and Combined

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/budget`, last month.

1. Click Germany.
2. Click Combined.

**Result**: Germany shows amounts in EUR, and they can be edited. Combined shows USD amounts that can't be edited, and it has no Save Budget button. Its subtitle names the first-of-month rate it uses.

### BUD-06 Rows that need review

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/budget`, last month.
- **Automated in**: `review.spec.ts`.

1. Click the line that says how many rows need review.

**Result**: the Review Inbox opens.

### BUD-07 Combined with no saved rate

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/budget`, with the address set to Combined and a month before the seeded 12 months.

1. Open Combined for that month.

**Result**: a panel says Combined figures need a saved EUR rate for that month. The month and view controls still work.

## Transactions

### TXN-01 Browse a month

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/transactions`, last month.

1. Look at the list.
2. Click Previous month, then Next month.

**Result**: the subtitle says how many rows are in the month. Rows are newest first, with Date, Description, Account, Type, Category and Amount, and an Edit button. A row that needs review shows Needs Review. A paired transfer shows Paired. A foreign purchase shows the amount charged with the original amount under it. On a phone, rows are cards with the same facts.

### TXN-02 Filter a month

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/transactions`, last month.

1. Type part of a merchant's name in Search this month.
2. Select one account in Account.
3. Select Spending in Type, then one category in the Category filter that appears.
4. Select Needs Review.
5. Click Previous month.
6. Type text no row has in the search box.
7. Click Clear Filters.

**Result**: each filter narrows the list, and the subtitle count follows. The Category filter shows only while Type is Spending. The filters stay set in step 5. Step 6 shows "No rows match these filters". Step 7 shows every row again.

### TXN-03 Give a row a category

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one row's type and category.
- **Start**: `/transactions`, last month.
- **Automated in**: `rowEdits.spec.ts`.

1. On a row that shows Needs Review, click Edit.
2. Edit Row shows the row's bank facts: Bank Text, Amount, Date, Account, Purpose, Bank Type and Bank Category.
3. Select Spending in Type and a category in Category, then click Save Row.
4. Reload the page.

**Result**: Edit Row closes. The row shows its category, not Needs Review, and the reload keeps it. Cancel in step 3 closes Edit Row and changes nothing. On a phone, Edit Row fills the screen.

### TXN-04 Move a row away from Spending

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one row's type and category.
- **Start**: `/transactions`, last month.
- **Automated in**: `rowEdits.spec.ts`.

1. Edit a Spending row with a category.
2. Select Income in Type.
3. Click Save Row.

**Result**: in step 2, Category becomes unavailable. After saving, the row shows Income and no category.

### TXN-05 Label a row

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one row's label.
- **Start**: `/transactions`, last month.
- **Automated in**: `rowEdits.spec.ts`.

1. Edit a row and type a label with spaces before and after it.
2. Click Save Row, then reload.

**Result**: the row shows the label first, trimmed, with the bank text under it. Its Edit button now names the label. Budget shows the same label when its category is opened.

### TXN-06 Hide a row and bring it back

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one row's hidden flag, set and then cleared.
- **Start**: `/transactions`, last month.
- **Automated in**: `rowEdits.spec.ts`.

1. Edit a row, select Hide this row from totals, and click Save Row.
2. Select Show Hidden.
3. Edit the hidden row, clear Hide this row from totals, and click Save Row.

**Result**: after step 1, the row leaves the list and the count drops by one. Step 2 shows it again, marked Hidden. After step 3, it's back in the list and the count is as before.

### TXN-07 Break a transfer pair

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: the types of both rows in one pair, and the pair itself.
- **Start**: `/transactions`, last month.
- **Automated in**: `rowEdits.spec.ts`.

1. Edit a row that shows Paired.
2. Select Spending in Type.
3. Select Transfer again, then Spending again.
4. Click Save Row.

**Result**: in step 2, a warning says the change removes this row's pair, and names the other row's amount. Step 3 hides the warning, then shows it again. After saving, neither row shows Paired, and the other row shows Needs Review.

### TXN-08 A save that fails

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/transactions`, last month.
- **Automated in**: `rowEdits.spec.ts`.

1. Edit a row and type a label.
2. Take the browser offline, then click Save Row.
3. Go back online, click Cancel, and reload.

**Result**: in step 2, Edit Row stays open and says the server can't be reached. After step 3, the label isn't there.

## Review Inbox

### REV-01 The inbox opens on the largest group

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/review`.
- **Automated in**: `review.spec.ts`.

1. Look at the Merchants tab.

**Result**: the subtitle says how many rows are left. The tabs are Merchants, No Merchant, Possible Transfers and Possible Duplicates, each with a count. Groups are largest first, and the largest is open. Its Accept button is unavailable until a category is chosen. On a phone, the tabs sit two to a row with shorter names, and a group's rows are a list.

### REV-02 Accept a merchant group

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: the type and category of every row in one group.
- **Start**: `/review`.
- **Automated in**: `review.spec.ts`.

1. Open a group other than the largest.
2. Select a category, then click Accept with its row count.
3. Reload.

**Result**: a notice says how many rows were saved. The group leaves the list, the next largest opens, and the rows-left count drops by the group's size. The reload keeps it. Those rows show their category on Transactions.

### REV-03 Change one row, then use the suggestion

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one row's category, then the rest of its group's.
- **Start**: `/review`.
- **Automated in**: `review.spec.ts`.

1. Open a group with several rows. Click Change on one row.
2. In the dialog, select a category and click Save Row.
3. Click Use beside the suggestion.
4. Click Accept.

**Result**: after step 2, that row leaves the group and the group shows "Suggested:" with that category. The category field stays empty until step 3, which fills it in. A suggestion never applies itself. After step 4, the group leaves the list.

### REV-04 A group with redacted text

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: the type and category of every row in that group.
- **Start**: `/review`.
- **Automated in**: `review.spec.ts`.

1. Open the group whose name holds [REDACTED].
2. Select a category and click Accept.

**Result**: the group says its text is redacted and asks for the rows to be checked before accepting. On a phone, this shows as a short line under the group's name. Accept saves the whole group.

### REV-05 Accept a group, then add a rule

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: adds one rule and sorts the rows it matches, then Undo removes both.
- **Start**: `/review`.
- **Automated in**: `ruleFromCorrection.spec.ts`.

1. Accept one PARCELPOINT group as Shopping.
2. The notice offers a rule so future imports do the same, with Add Rule... and Skip. Click Add Rule...
3. Add Rule shows the row's full text in Value, with a hint to shorten it so later purchases match. Shorten it to the shared part.
4. Select the box that also sorts the matching rows in review. Click Show Rows to see some of them.
5. Click Save Rule.
6. Click Undo.

**Result**: in step 4, the dialog says how many rows the rule would sort and from how many groups. After step 5, the notice says the rule was saved and how many more rows were sorted as Shopping, and those groups leave the inbox. After step 6, the notice says the rule was deleted and the rows are back in review. Rules doesn't list the rule.

### REV-06 Skip the rule

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one group's rows. No rule.
- **Start**: `/review`.
- **Automated in**: `ruleFromCorrection.spec.ts`.

1. Accept a group that offers a rule.
2. Click Skip.

**Result**: the notice says how many rows were saved, with no rule offer. Rules has no new rule.

### REV-07 An earlier rule already matches

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one rule added on Rules, and one group's rows.
- **Start**: `/rules`.
- **Automated in**: `ruleFromCorrection.spec.ts`.

1. Add a text rule that matches PARCELPOINT rows, with Spending and Shopping.
2. On the Review Inbox, accept a PARCELPOINT group and click Add Rule...
3. Click Edit Earlier Rule, then Save Rule.

**Result**: in step 2, the dialog says an earlier rule matches this row first, and Save Rule is unavailable. Step 3 opens Edit Rule with the earlier rule as stored. Saving adds no new rule.

### REV-08 Decide No Merchant rows one at a time

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one row's label, and another row's category.
- **Start**: `/review?section=no-merchant`.
- **Automated in**: `review.spec.ts`.

1. On the first row, type a label and click Save Row.
2. Reload.
3. On a row, select a category and click Save Row.

**Result**: each row shows its own bank facts and has its own Save Row. There's no Accept. After step 1, the row keeps its label and stays to be decided. After step 3, the row leaves the list and the rows-left count drops by one.

### REV-09 Mark possible transfers

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: pairs two rows as a transfer, twice, and gives a third row a type.
- **Start**: `/review?section=transfers`.
- **Automated in**: `review.spec.ts`.

1. On a Same Amount Within 3 Days match, both rows are already selected. Click Mark as Transfer.
2. On a Card Payment match with three rows, it asks to select the two rows that belong together. Select two, then click Mark as Transfer.
3. On another Card Payment match with three rows, use Set Type on one row and select Spending.

**Result**: step 1 says "The rows are marked as a transfer." and the match leaves the tab. In step 2, Mark as Transfer stays unavailable until two rows are selected, and the row left over waits under Merchants. In step 3, that row leaves the match and the two left show as a pair, already selected. Nothing is stored for the pair until Mark as Transfer.

### REV-10 Possible duplicates

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: hides one row, and clears the flag on another.
- **Start**: `/review?section=duplicates`.
- **Automated in**: `review.spec.ts`.

1. On one row, click Hide Row.
2. On another row, click Dismiss.
3. On Transactions, for that row's month, select Show Hidden.

**Result**: each row leaves the tab, and a reload keeps them gone. In step 3, the hidden row shows, marked Hidden. The dismissed row stays in every total.

### REV-11 Move between tabs

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/review`.
- **Automated in**: `screens.spec.ts` (each tab loads at both widths).

1. Click each tab in turn, then reload on Possible Duplicates.

**Result**: each tab shows its own list and marks itself as current. The address holds the tab, so the reload stays on Possible Duplicates. No tab scrolls sideways on a phone.

## Import

### IMP-01 Import statements

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: adds the new rows from the files, and any exchange rates they need.
- **Start**: `/import`, desktop width.

1. Click Choose Files and pick synthetic CSV statements for several accounts, Chase and Commerzbank.
2. The files are listed with their sizes, and a line shows the total against the 1 MB limit.
3. Click Import.
4. Click Go to Review Inbox.

**Result**: step 3 shows Import Finished, how many files were imported, and that nothing was overwritten. It counts New, Skipped, Possible Duplicates and Ignored Pending rows. Step 4 opens the Review Inbox with any new rows that need a decision.

A Commerzbank file dated inside the seeded months uses saved rates. One dated outside them asks the rates service, so the run needs that service or a stand-in. See the PR's open points.

### IMP-02 Import the same files again

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: Import Finished, after IMP-01.

1. Click Import More Files.
2. Pick the same files and click Import.

**Result**: Import Finished shows 0 New, and every row counted as Skipped. Transactions has no extra rows.

### IMP-03 Change the chosen files

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/import`, desktop width.

1. Choose two files. Choose one of them again.
2. Remove one file with its remove button.
3. Remove the other.

**Result**: a file chosen twice is listed once. Each removal drops it from the list and the total. With no files, Import is unavailable.

### IMP-04 A file that can't be imported

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/import`, desktop width.

1. Choose one good statement and one CSV that isn't a bank statement.
2. Click Import.
3. Choose files that add up to more than 1 MB, then click Import.

**Result**: step 2 says the second file isn't a format Budget Builder can read, that nothing was stored, and to export a CSV from Chase or Commerzbank. The good file isn't stored either. Step 3 says how big the upload is, that the limit is 1 MB and that nothing was sent.

### IMP-05 Import on a phone

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/import`, phone width.

1. Look at the screen.
2. Click Go to Review Inbox.

**Result**: the screen says "Import Works on a Laptop", with no file picker. Step 2 opens the Review Inbox.

## Rules

### RUL-01 Read the rules

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/rules`.

1. Look at the screen.

**Result**: the subtitle says rules apply to future imports. ID Rules comes first and says "No ID rules yet." Text Rules lists the seeded rules top to bottom, each with Match, Value and what it Gives. On a phone, each rule is a card.

### RUL-02 Add a rule

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: adds one rule.
- **Start**: `/rules`.

1. Click Add Rule.
2. Leave Value empty and click Save Rule.
3. Select Starts With in Match, type a value, select Spending in Type and a category, and click Save Rule.

**Result**: step 2 says "Enter a value." and saves nothing. Step 3 closes the dialog and lists the rule last in Text Rules, with its type and category. Category shows only while Type is Spending.

### RUL-03 Edit a rule

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one rule's value, type or category.
- **Start**: `/rules`.

1. Click Edit on a rule.
2. Change its value and click Save Rule.

**Result**: Edit Rule opens with the rule as stored. After saving, the list shows the change, and a reload keeps it.

### RUL-04 Reorder rules

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: the order of two rules.
- **Start**: `/rules`.

1. Click the down arrow on the first text rule.
2. Reload.

**Result**: the rule moves one place down, and the reload keeps the order. The first rule's up arrow and the last rule's down arrow are unavailable.

### RUL-05 Delete a rule

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: removes one rule.
- **Start**: `/rules`.

1. Click the delete button on a rule.
2. Click Cancel. Then click the delete button again, and click Delete Rule.

**Result**: the dialog says future imports won't use this rule and rows it already sorted don't change. Cancel keeps the rule. Delete Rule removes it from the list. Rows it sorted keep their type and category on Transactions.

### RUL-06 Rules with none yet

- **Session**: Second user.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/rules`.

1. Look at the screen.

**Result**: a panel says "No Rules Yet", with Add Rule.

## Settings

### SET-01 Add a category

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: adds one category.
- **Start**: `/settings`.

1. Click Add Category with New Category empty.
2. Type the name of a category that exists and click Add Category.
3. Type a new name and click Add Category.

**Result**: step 1 says "Enter a category name." Step 2 says the name is taken. Neither saves. Step 3 empties the field and lists the category last. It shows on Budget too.

### SET-02 Rename a category

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: one category's name.
- **Start**: `/settings`.

1. Click Rename on a category. On a phone, it's the pencil button.
2. Press Escape.
3. Click Rename again, type a new name and click Save.

**Result**: Escape leaves the old name. After Save, the new name shows here and on Budget, Transactions and the Review Inbox.

### SET-03 Reorder categories

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: the order of two categories.
- **Start**: `/settings`.

1. Click the down arrow on the first category.
2. Open Budget.

**Result**: the category moves one place down here and on Budget. The first category's up arrow and the last category's down arrow are unavailable.

### SET-04 Delete a category

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: removes one unused category.
- **Start**: `/settings`.

1. Click the delete button on Groceries, which has rows, a rule and budget amounts.
2. Add a new category, then click its delete button.

**Result**: step 1 says the category can't be deleted, how many transactions, rules and budget amounts it has, and to change those first. Nothing is deleted. Step 2 says the category was deleted, and it leaves the list.

### SET-05 Base currency

- **Session**: Fake owner.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/settings`.

1. Look at Base Currency.

**Result**: it shows USD, with no way to change it. On a phone, it comes first.

## A user with no rows

### EMPTY-01 Every screen, empty

- **Session**: Second user.
- **Release**: Go-live.
- **Changes**: Nothing.
- **Start**: `/`.

1. Open each screen from the sidebar.

**Result**: no screen shows any of the fake owner's rows, categories, rules or amounts.

- Overview says "No Statements Imported Yet".
- Budget says "No categories yet. Add one in Settings to set a budget."
- Transactions says there are no rows in the month, with Go to Import.
- Review Inbox says "Nothing to review yet", with Go to Import.
- Import shows the file picker, as for the owner.
- Rules says "No Rules Yet".
- Settings says "No categories yet." and shows USD.

### EMPTY-02 A first budget

- **Session**: Second user.
- **Release**: Go-live.
- **Changes**: adds one category and one budget amount for the second user.
- **Start**: `/settings`.

1. Add a category.
2. Open Budget, US view, current month.
3. Enter an amount for the category and click Save Budget.

**Result**: in step 2, Budget says to set this month's budget, that amounts are in USD, and that a blank category budgets nothing. After step 3, it says "Budget saved." The fake owner's budget doesn't change.

## Before public launch

These screens aren't built yet. Each ticket below writes or corrects its flows when it's built. Until then, these describe what its spec asks for.

When #80 lands, the Overview moves to `/overview`, and log in lands there. AUTH-01, AUTH-03, AUTH-05, AUTH-08, NAV-01 and the route table change with it.

| Route | Screen | Flows |
| --- | --- | --- |
| `/` (logged out) | Public intro | PUB-01, PUB-03 |
| `/overview` | Overview | PUB-02 |
| `/demo`, `/demo/login`, `/demo/login/mfa` | Demo log in and code | DEMO-01, DEMO-04 |
| `/demo/overview` | Demo Overview | DEMO-01, PUB-03 |
| `/demo/budget`, `/demo/transactions`, `/demo/rules`, `/demo/settings` | Demo screens | DEMO-02 |
| `/demo/review`, `/demo/import` | Demo review and import | DEMO-03 |

### PUB-01 The public intro

- **Session**: None.
- **Release**: Before public launch (#80).
- **Changes**: Nothing.
- **Start**: `/`.

1. Look at the page.
2. Click Owner log in.

**Result**: the intro shows the product's name, a one-line description and three short points. Its footer says it's a personal project with one user and no signup. Step 2 opens Log In. A visitor who has entered a password but no code also sees the intro at `/`.

### PUB-02 The owner's way in

- **Session**: Fake owner.
- **Release**: Before public launch (#80).
- **Changes**: Nothing.
- **Start**: `/`.

1. Go to `/` while logged in.
2. Log out, then log in again with a code.

**Result**: step 1 opens the Overview at `/overview`. Step 2 lands on `/overview`. The sidebar's Overview item opens `/overview`.

### DEMO-01 Demo log in and code

- **Session**: None.
- **Release**: Before public launch (#82).
- **Changes**: Nothing stored. The demo keeps its data in the page only.
- **Start**: `/demo`.

1. `/demo` opens the demo's Log In, with the details filled in and a line saying they're made up.
2. Click Log In.
3. The demo's Enter Code shows the code, filled in. Click Verify Code.

**Result**: the demo Overview opens on a filled-in month that ends in the current month, with US, Germany and Combined. A bar on every demo screen says it's sample data that resets on reload, with Back to Intro. No request goes to Supabase.

### DEMO-02 Demo screens keep changes until a reload

- **Session**: None.
- **Release**: Before public launch (#83).
- **Changes**: Nothing stored.
- **Start**: the demo Overview, after DEMO-01.

1. On Budget, change an amount and save it.
2. On Transactions, edit a row. On Rules, add a rule. On Settings, add a category.
3. Move between demo screens.
4. Reload.

**Result**: each change shows as it would in the app, and stays while moving between screens. Settings has no Data section. The reload starts the demo over, without the changes.

### DEMO-03 Sample import and review in the demo

- **Session**: None.
- **Release**: Before public launch (#84).
- **Changes**: Nothing stored.
- **Start**: the demo Import, desktop width.

1. Run the sample import.
2. Run it again.
3. Open the demo Review Inbox and accept a group.

**Result**: step 1 reports new and skipped rows. Step 2 reports them all as skipped. There's no way to pick a file of one's own. In step 3, the group's rows move into category totals on the demo Budget. At phone width, Import shows the laptop-only notice.

### DEMO-04 Demo log out

- **Session**: None.
- **Release**: Before public launch (#82).
- **Changes**: Nothing stored.
- **Start**: a demo screen, after changing something in DEMO-02.

1. Click Log Out.
2. Log in to the demo again.

**Result**: step 1 opens the demo's Log In. After step 2, the demo is back at its starting data.

### PUB-03 The demo on the intro

- **Session**: None.
- **Release**: Before public launch (#85).
- **Changes**: Nothing.
- **Start**: `/`, desktop width, then phone width.

1. On a desktop, look at the demo window on the intro.
2. Click Open Full Screen in the window, then Back to Intro.
3. On a phone, click Try the Demo.

**Result**: on a desktop, the window shows the demo Overview, not its log in. Open Full Screen opens the demo's Log In, and Back to Intro returns to `/`. On a phone, the intro shows no window, and Try the Demo opens the demo's Log In full screen.

## Waiting for their tickets

These go-live features aren't built yet. Each ticket adds its flows here when it's built.

| Ticket | What it adds | Flows it adds |
| --- | --- | --- |
| #63 | Backup in Settings' Data section | Back up all data, and a backup that fails |
| #64 | Last backup dates on Settings | When a backup was last tried, and when one last worked |
| #66 | Delete All Data on Settings | Delete all with `DELETE` and a fresh code, a wrong code, and the empty screens after |
| #77 | Error pages and the test-error trigger | A crash shows the app's error page and Try Again, and the trigger's routing for each log-in stage |
| #92, #94 | Joint savings on the Overview and Settings | Savings balances, the chart, and entered balances |
