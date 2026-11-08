# Hosted checklist, rollback and off switch

The owner works through this list before go-live. It covers what Claude can't see: the hosted Supabase project, the Vercel project, and what to do when launch goes wrong. Claude never runs any of it.

This file is public. Your answers aren't.

## How to use it

- Each check is one dashboard page or one SQL query, with its pass state beside it. Answer pass or fail. Never write down the value you see.
- Use Safari and your own terminal. Each command or query sits in its own block, so copy one at a time.
- Every SQL query only reads, and returns one `true` or `false`. Run each in the Supabase dashboard: open the project, select **SQL Editor**, then **New query**, paste, and click **Run**. An error counts as a fail.
- Keep your answers in your own notes, never in this repo, an issue or a PR. A failing check names a weakness, so don't post which check failed.
- Most fails are a setting you can fix on the same page. Fix it, then check again. When the fix needs code or a migration, file a fix ticket that blocks #72, worded by the fix.
- Once every check passes, comment on #126 with "Hosted checklist: all pass" and nothing else.

Dashboard page names change. If a setting isn't where a check says, search the dashboard for the setting's name.

The deploy steps are written in #71: [deploy steps](https://github.com/jonleach10/budget-builder/issues/71). This list links to them and doesn't repeat them.

## Part 1: Supabase, before go-live

Run this part during the first launch check (#126). It needs no Vercel project.

### S1. Row cap

- **Where:** Project Settings, then **Data API**. On newer dashboards it's under **Integrations**, then **Data API**, then **Settings**.
- **Pass:** **Max rows** is 1,000 or more.
- **On a fail:** set it to 1,000 and click **Save**. The app reads 1,000 rows a page, so a lower cap makes it stop reading early and miss rows.

### S2. Exposed schemas

- **Where:** the same Data API page.
- **Pass:** **Exposed schemas** lists only `public` and `graphql_public`.
- **On a fail:** remove any other schema and click **Save**.

### S3. Signups closed

- **Where:** Authentication, then **Sign In / Providers**, then **User Signups**.
- **Pass:** **Allow new users to sign up** is off.
- **On a fail:** disable it and click **Save**. Your own login keeps working.

### S4. Anonymous sign-ins off

- **Where:** the same page.
- **Pass:** **Allow anonymous sign-ins** is off.
- **On a fail:** disable it and click **Save**.

### S5. Authenticator app

- **Where:** Authentication, then **Multi-Factor**.
- **Pass:** **Authenticator app (TOTP)** is enabled for enrollment and verification.
- **On a fail:** enable both and click **Save**.

### S6. Encrypted connections only

- **Where:** Project Settings, then **Database**, then **SSL Configuration**.
- **Pass:** **Enforce SSL on incoming connections** is on.
- **On a fail:** enable it.

### S7. Security Advisor

- **Where:** Advisors, then **Security Advisor**. Click **Refresh** first.
- **Pass:** no item at the **Error** level.
- **On a fail:** file a fix ticket that blocks #72, named by the fix. Warnings don't fail this check. To ask Claude about one, give its title only.

### S8. The service role may run the import function

- **Where:** SQL Editor.
- **Pass:** `true`.
- **On a fail:** file a fix ticket that blocks #72. Grants change through a migration, so don't grant it by hand.

```sql
select has_function_privilege('service_role', 'public.import_transactions(jsonb, jsonb, jsonb)', 'execute');
```

### S9. Signed-out visitors can run no function

- **Where:** SQL Editor.
- **Pass:** `true`.
- **On a fail:** file a fix ticket that blocks #72.

```sql
select not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('anon', oid, 'execute'));
```

### S10. Every table has row-level security and needs MFA

- **Where:** SQL Editor.
- **Pass:** `true`.
- **On a fail:** use off switch B below, then file a fix ticket that blocks #72.

```sql
select coalesce(bool_and(c.relrowsecurity and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'requires_mfa')), false) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r';
```

### S11. One login

- **Where:** SQL Editor.
- **Pass:** `true`.
- **On a fail:** make sure S3 passes, then file a fix ticket that blocks #72. Removing a login is a one-way door, so don't delete one by hand.

```sql
select (select count(*) from auth.users) = 1;
```

### S12. Your login has an authenticator app

- **Where:** SQL Editor.
- **Pass:** `true`.
- **On a fail:** log in to the app on your Mac and set up the authenticator app when it asks, then run the query again.

```sql
select exists (select 1 from auth.mfa_factors where factor_type = 'totp' and status = 'verified');
```

### S13. No sandbox rows on hosted

The sandbox's made-up accounts start with "Sandbox" and its made-up merchants with "SAMPLE". None should be on hosted.

- **Where:** SQL Editor.
- **Pass:** `true`.
- **On a fail:** file a fix ticket that blocks #72. Deleting stored rows is a one-way door, so don't delete them by hand.

```sql
select not exists (select 1 from public.accounts where name like 'Sandbox %') and not exists (select 1 from public.transactions where description like 'SAMPLE %');
```

## Part 2: Supabase and Vercel, at go-live

Run this part during go-live (#72), straight after the deploy steps create the Vercel project and before you rely on the live app. Where a check says "your app's address", that's the `.vercel.app` address the deploy steps gave you.

### G1. Site URL and redirects

- **Where:** Supabase, Authentication, then **URL Configuration**.
- **Pass:** **Site URL** is your app's address. **Redirect URLs** holds only that address, with no `*` and no `localhost`.
- **On a fail:** correct the list and click **Save**.

### G2. Only main goes to production

- **Where:** Vercel project, Settings, then **Environments**, then **Production**.
- **Pass:** **Branch Tracking** is `main`.
- **On a fail:** change it to `main` and click **Save**.

### G3. No preview deployments

- **Where:** Vercel project, **Deployments**, with the environment filter set to **Preview**.
- **Pass:** no deployments listed.
- **On a fail:** delete each preview deployment from its menu, then check that `vercel.json` on `main` still turns off every branch except `main` (#71). If it does, file a fix ticket that blocks #72.

### G4. Only public keys on Vercel

- **Where:** Vercel project, Settings, then **Environment Variables**. Read the names only. Don't reveal any value.
- **Pass:** the only names are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the Sentry names in the deploy steps (#78). No name holds `SECRET`, `SERVICE_ROLE` or `PASSWORD`.
- **On a fail:** delete the extra variable and redeploy. If it held a secret key or the database password, treat that as leaked: use off switch B below, then plan the key change in a session before rotating anything.

### G5. Deployment protection

- **Where:** Vercel project, Settings, then **Deployment Protection**.
- **Pass:** **Vercel Authentication** is enabled, at **Standard Protection**.
- **On a fail:** enable it and click **Save**.

### G6. Build logs and source stay private

- **Where:** Vercel project, Settings, then **Security**.
- **Pass:** **Build Logs and Source Protection** is enabled.
- **On a fail:** enable it and click **Save**.

### G7. Forks can't deploy

- **Where:** Vercel project, Settings, then **Security** (on some dashboards, **Git**).
- **Pass:** **Git Fork Protection** is enabled.
- **On a fail:** enable it and click **Save**. The repo is public, so anyone can open a pull request from a fork.

### G8. Function region

- **Where:** Vercel project, Settings, then **Functions**.
- **Pass:** **Function Region** is the region the deploy steps chose, next to the Supabase project.
- **On a fail:** select that region, click **Save**, and redeploy.

### G9. Logged-out visitors reach only Log In

- **Where:** a Safari private window, at your app's address followed by `/transactions`.
- **Pass:** the Log In page shows, and no budget screen.
- **On a fail:** use off switch A below, then file a fix ticket that blocks #72.

### G10. Security headers

Run this once the security headers (#122) have shipped. Copy the command, replace `YOUR-APP` with your app's address name, then press Return.

- **Where:** your terminal.
- **Pass:** it prints `4`.
- **On a fail:** file a fix ticket that blocks #72.

```sh
curl -sI https://YOUR-APP.vercel.app/login | grep -ciE '^(strict-transport-security|content-security-policy|x-content-type-options|referrer-policy):'
```

## Off switch

There are two switches. Pick by what's wrong.

- **A. Site off.** For a broken or misbehaving site. Takes seconds and keeps every row.
- **B. Data off.** For when the data might be exposed: a login you don't recognize, a permissions bug, or a key that may have leaked. The publishable key is public by design, so anyone can reach the Supabase API directly. Switch A doesn't stop that, and switch B does.

When in doubt, use both.

### A. Take the site offline

1. In the Vercel project, select **Firewall**, then **Configure**.
2. Click **New Rule**. Name it "Off switch".
3. Set the condition to **Request Path**, **Starts with**, `/`. Set the action to **Deny**.
4. Click **Save Rule**, then **Review Changes**, then **Publish**.
5. Open your app's address in a Safari private window. Pass: the page is refused.

To turn the site back on, delete the "Off switch" rule and publish again.

### B. Take the data offline

1. In the Supabase dashboard, open the project, then Project Settings, then **General**.
2. Under the project's availability, click **Pause project** and confirm.
3. Wait until the dashboard says the project is paused. Every row stays. The app can't log you in or read anything until you restore it.

To turn the data back on, follow "Paused project" below. On Free, a paused project can be restored from the dashboard for 90 days.

## Roll back a bad deploy

Merging to `main` ships to production, so a bad merge goes live. Roll back first, then fix forward. If the bad deploy is the first one, there's nothing to roll back to: use off switch A, then fix forward.

1. In the Vercel project, select **Deployments** and find the production deployment before the bad one.
2. Open its menu and select **Instant Rollback**, then confirm. On Hobby, only the previous production deployment can be rolled back to.
3. Open your app in Safari and log in with MFA. Pass: the screens work.
4. Undo the bad change on GitHub: open the merged pull request in Safari and click **Revert**. GitHub opens a new pull request that undoes it. Merge it once CI passes.
5. After an instant rollback, Vercel stops sending new merges to production on its own. In **Deployments**, open the revert's production deployment once it's ready, open its menu and select **Promote**. That turns automatic production deploys back on.

If GitHub can't revert the pull request, do it from your terminal, one command at a time, in your own checkout:

```sh
git switch main
```

```sh
git pull
```

```sh
git log --oneline --merges -10
```

Find the bad merge in that list, then start a branch for the revert:

```sh
git switch -c fix/revert-bad-merge
```

Replace `MERGE-COMMIT` with the bad merge's short code from the list:

```sh
git revert -m 1 MERGE-COMMIT
```

```sh
git push -u origin HEAD
```

Then open the pull request on GitHub in Safari and carry on from step 5.

### If the bad deploy came with a migration

Rolling back code is safe. Each migration runs on hosted before its pull request merges, and must work with the code already live, so the earlier code works with the newer schema. Don't undo a migration by hand in the SQL Editor. A fix is a new migration, following the migration flow in the deploy steps.

### If rows were damaged

Supabase Free keeps no backups, so your own backup file is the only copy.

1. Use off switch A so nothing else changes.
2. If the app still loads, take a backup from Settings first. It records the state you're about to fix.
3. Restore your last good backup into a new project, following the restore steps from #65, then point Vercel at it with the deploy steps.

## Paused project

Supabase Free pauses a project after a long stretch with no activity, and emails a warning about a week before. While it's paused, the site loads but can't log you in or read anything. A project you paused with off switch B is restored the same way.

If the warning email arrives, follow what it says to keep the project active.

To restore it:

1. In the Supabase dashboard, open the project. It says the project is paused.
2. Click **Restore project** and confirm.
3. Wait until the dashboard shows the project as healthy. It can take several minutes.
4. Open your app in Safari and log in with MFA. Pass: Overview shows your budget.
5. Run S1, S3 and G1 again. Pass: all three pass.

The project keeps its address and keys, so Vercel needs no change.

If restoring fails:

- **Too many active projects.** Free allows only 2 active projects. Delete the spare project from the restore test (#67), or pause another Free project, then try again.
- **No Restore project button.** After 90 days paused, the dashboard can't restore it. Restore your last backup into a new project with the restore steps from #65, then point Vercel at the new project with the deploy steps.
