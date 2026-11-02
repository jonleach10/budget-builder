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

Rows come from `sandbox/generate.ts` and go through the real import. A fake owner signs in at the real login and MFA pages. Nothing here changes hosted, and it isn't part of CI.

History
- January 20th, 2026 => 0.1: first working version