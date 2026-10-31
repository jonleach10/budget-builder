# Budget Builder

## Commands

- `npm run dev` starts the dev server
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Product

A budget for joint money across Chase accounts in the US and Commerzbank accounts in Germany. It has a USD budget, a EUR budget and a combined USD view. One user. CSV import only.

## Structure

- `app/` holds thin routes.
- `features/` holds logic by domain: `import`, `categorize`, `budget`, `auth`.
- `components/ui/` holds shadcn components.
- `lib/` holds shared utilities.
- `supabase/migrations/` holds schema and row-level security.

## Rules

- Money is integer minor units plus a currency, never floats.
- Business logic never lives in routes or components.
- Every new table has row-level security, with policies tested.
- Never commit, log or send to analytics any real statement data, account numbers or transaction text. Test fixtures are synthetic.
- No transaction data goes to AI services.
- UI work follows the project's `midnight-glass` skill, and interface text follows the `voice` skill.

## Review criteria

The rules above, plus:

- Tests cover new domain logic.
- No secrets.
- No `any` without a reason.
- The change matches its issue's acceptance criteria.

## PR policy

Claude works in local sessions only. No Claude workflow, token or bot runs on GitHub, and GitHub Actions holds no secrets. Claude may open PRs from a local session. Claude never approves or merges. Only the owner does.

PRs follow `.github/pull_request_template.md`. Claude opens a PR only with proof of testing to put in its Testing done section.

Commits have no `Co-Authored-By` lines. PR descriptions have no "Generated with Claude Code" line or session link.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
