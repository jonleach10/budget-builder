Closes #{issue-number}
<!-- No issue? Name the queue item instead, such as: Queue: Q99 -->

## Type of Task
- [ ] New feature
- [ ] Bug fix
- [ ] Refactoring
- [ ] UI/UX improvement
- [ ] Change request
- [ ] Docs or chore

## Problem
<!-- One to three sentences, from the user's side: what was wrong or missing. -->

## Solution
<!-- What changed, from the user's side, in about five bullets.
Never a file-by-file list, the history of review rounds or an implementation diary. -->

**Acceptance criteria**
<!-- Copy the issue's criteria. Tick each one and say where it's proved.
No issue? Say so in one line. -->
- [ ]

## Testing done
<!-- Agents must not open a PR without proof of testing. -->
- **Lint, typecheck, tests, build**: the result of each
- **Sandbox flows**: passed out of total, or "Not run"
- **Owner's Safari check**: the result, or "Not run"
- **pr-review** at {commit}: {n} findings, {n} fixed, {n} declined
  - Declined: {finding}: {one-line reason}
- **Not tested**: what wasn't proved, or "Nothing"

## Proof
<!-- The commit the proof was taken at, then what applies: sandbox screenshots for a
UI-facing PR (synthetic rows only, never real data), metrics such as a speed report or
row counts, and output for anything CI can't run. Docs only: "Not UI-facing." -->
Taken at {commit}.

## Merge Danger
<!-- What could go wrong once this merges. A single "None" is fine when all three are none. -->
- **One-way doors**: any from `CLAUDE.md` that this touches, and why it's safe
- **Rollback**: how to undo this
- **Order**: other PRs or steps this depends on
