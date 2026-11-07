# Budget Builder

## Commands

- `npm run dev` starts the dev server
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

The local sandbox runs the app on local Supabase with synthetic rows. Run it from a worktree with no `.env.local`:

- `npm run sandbox:start` starts everything from cold, and stays running
- `npm run sandbox:flows` resets the rows and runs the browser checks
- `npm run sandbox:shot -- <path> [--phone] [--full]` saves a screenshot
- `npm run sandbox:down` stops it and frees its memory

## Product

A budget for joint money across Chase accounts in the US and Commerzbank accounts in Germany. It has a USD budget, a EUR budget and a combined USD view. One user. CSV import only.

## Structure

- `app/` holds thin routes.
- `features/` holds logic by domain: `import`, `categorize`, `budget`, `fx`, `auth`.
- `components/ui/` holds shadcn components.
- `lib/` holds shared utilities.
- `supabase/migrations/` holds schema and row-level security.

## Rules

- Money is integer minor units plus a currency, never floats.
- Business logic never lives in routes or components.
- Every new table has row-level security, with policies tested.
- Never commit, log or send to analytics any real statement data, account numbers or transaction text. Test fixtures are synthetic.
- No transaction data goes to AI services. Claude views screens only through the local sandbox, never the app on port 3000 or anything showing real rows.
- UI work follows the project's `midnight-glass` skill, and interface text follows the `voice` skill.

## One-way doors

These are hard or impossible to undo. Each needs the owner's go on the plan before building, runs in the main session rather than a background agent, and gets a line in the PR's Merge Danger section.

- Schema migrations and anything run against the hosted database.
- Row-level security policies.
- Auth: sign-in, session checks, signup settings and MFA.
- Deleting stored data, or changing what's kept.
- The fingerprint format or text cleaning, once rows are stored, because raw bank text is discarded after parsing.
- Anything pushed to this public repo that can't be taken back, such as secrets or real data.
- Repo rules and hosting settings.

## Review criteria

The rules above, plus:

- Tests cover new domain logic.
- No secrets.
- No `any` without a reason.
- The change matches its issue's acceptance criteria.
- A change that touches a one-way door names it under Merge Danger.
- A UI-facing PR has a sandbox screenshot in its Proof section that shows the change itself.
- A PR that adds a domain term, or settles a decision that's hard to reverse, surprising and a real trade-off, updates `GLOSSARY.md` or `docs/adr/` in the same PR.

## PR policy

Claude works in local sessions only. No Claude workflow, token or bot runs on GitHub, and GitHub Actions holds no secrets. Claude may open PRs from a local session. Claude never approves or merges. Only the owner does.

PRs follow `.github/pull_request_template.md`. Claude opens a PR only with proof of testing to put in its Testing done section.

A PR is UI-facing if it touches `app/`, `components/` or a `.tsx` file. Its Proof section needs a screenshot that proves the code changed: the changed screen, in the state the change affects, at the PR's head commit. Take it with `sandbox:shot`, or from a sandbox flow if the change only shows after a click. Screenshots hold synthetic rows only. Attach them with `--attach` on `gh pr create` or `gh pr edit`, which needs `gh` 2.99.0 or later. Older tickets call Proof the Demo section.

Commits have no `Co-Authored-By` lines. PR descriptions have no "Generated with Claude Code" line or session link.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
