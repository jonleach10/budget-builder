## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Local sandbox

The sandbox runs the real app on a local Supabase with made-up rows, so a screen can be checked without touching real data. It needs Colima and Docker (`brew install colima docker`), and `npx playwright install webkit` once.

Run it from a worktree that has no `.env.local`. The commands refuse to start if it has one, because that file points at the hosted project.

```bash
npm run sandbox:start   # starts everything from cold, on http://127.0.0.1:3100
npm run sandbox:flows   # resets the rows and runs the browser checks
npm run sandbox:shot -- "/transactions?month=2026-10" --phone
npm run sandbox:down    # stops it and frees its memory
```

Rows come from `sandbox/generate.ts` and go through the real import. A fake owner signs in at the real login and MFA pages. A second fake user, `second-user@sandbox.invalid`, has its own MFA and owns no rows, so the owner's rows can be tried as someone else. Nothing here changes hosted, and it isn't part of CI.

Odd states come on request, and the normal seed never has them:

```bash
npm run sandbox:weird -- leap-day zero-rate      # writes statements to sandbox/.weird to import by hand
npm run sandbox:weird -- missing-rate            # reseeds, then changes stored rows the import can't
```

Statements: `semicolon-purpose`, `leap-day`, `long-transfer-number`, `zero-rate`, `decomposed-unicode`, `empty-month`, `rows-today`. Stored rows: `missing-rate`, `half-failed-move`. `SANDBOX_WEIRD_DIR` changes where statements go.

History
- January 20th, 2026 => 0.1: first working version

## License

MIT. See [LICENSE](LICENSE).