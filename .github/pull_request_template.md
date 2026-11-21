Closes #{issue-number}
<!-- No issue? Name the queue item instead, such as: Queue: Q99 -->

<!-- Everything above the first folded section fits on one screen. Every heading stays:
"None." and "Built as specified." are full answers, so nothing hides by being left out.
Link code at the head commit, so the links stay right:
https://github.com/jonleach10/budget-builder/blob/{commit}/{path}#L{n}-L{m} -->

## At a glance

| | |
|---|---|
| **Type** | New feature, bug fix, refactoring, UI/UX improvement, change request, or docs or chore |
| **Tier** | Light (docs, CI, sandbox or tests only), Standard (behaviour changes, no door) or Deep (touches a door), and why in a few words |
| **Doors** | Each door and what it changes in a few words, or "None" |
| **Matches spec?** | "Yes", or how many differences and open calls |
| **Needs your call** | How many decisions wait for the owner, or "None" |
| **Checks** | lint, typecheck, build: {result} · tests: {n} pass · sandbox flows: {n} of {n} · Safari check: {result} · pr-review at {commit}: {n} found, {n} fixed, {n} declined |
| **Not proved** | What wasn't proved, or "Nothing" |
| **Size** | {n} files, +{n} / −{n} (about {n} of the changed lines are tests) |

## Problem
<!-- One or two sentences, from the user's side: what was wrong or missing. -->

## Solution
<!-- At most five one-line bullets, from the user's side.
Never a file-by-file list, the history of review rounds or an implementation diary. -->

## Differs from the spec
<!-- Every place the build differs from the issue: a criterion not met, met another way, or moved
to another ticket. Write "Built as specified." when there are none. No issue? Say so in one line. -->

| Spec said | Built | Why |
|---|---|---|

## Calls the spec left open
<!-- Design or behaviour decisions the issue didn't make, each with a link to its code.
Write "None." when there are none. -->

| Call | Where |
|---|---|

## Doors: read these
<!-- One block for each door in CLAUDE.md that this touches, or "None.". -->

### Door: {name}
- **What changes:**
- **Read, in this order:** at most four places, each linked, with what it does
- **Tests that pin it:**
- **Safe because:**
- **Undo:**

## Needs your call
<!-- Decisions the owner makes before or after merging, each with a sentence of context.
Write "None." when there are none. -->

<details>
<summary><b>Testing done</b></summary>

<!-- Agents must not open a PR without proof of testing. -->
- **Lint, typecheck, tests, build**: the result of each
- **Sandbox flows**: passed out of total, or "Not run"
- **Owner's Safari check**: the result, or "Not run"
- **pr-review** at {commit}: {n} findings, {n} fixed, {n} declined
  - Declined: {finding}: {one-line reason}
- **Not tested**: what wasn't proved, or "Nothing"

</details>

<details>
<summary><b>Acceptance criteria</b></summary>

<!-- Copy the issue's criteria. Tick each one and say where it's proved.
No issue? Say so in one line. -->
- [ ]

</details>

<details>
<summary><b>Merge Danger</b>: rollback, order</summary>

<!-- What could go wrong once this merges. Doors go in their own section above.
A single "None" is fine when both are none. -->
- **Rollback**: how to undo this
- **Order**: other PRs or steps this depends on

</details>

## Proof
<!-- The commit the proof was taken at, then what applies: sandbox screenshots for a
UI-facing PR (synthetic rows only, never real data), metrics such as a speed report or
row counts, and output for anything CI can't run. Fold any long report in a <details> block;
keep the screenshots outside it. Docs only: "Not UI-facing." -->
Taken at {commit}.
