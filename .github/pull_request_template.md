## What changed

<!-- A short summary of the change. -->

## Why

<!-- The problem this solves. Link the issue, for example "Closes #123". -->

## How it was tested

<!-- Commands run, tests added, manual checks. Use synthetic data only. -->

## Checklist

- [ ] The change matches the acceptance criteria of its issue
- [ ] Money is integer minor units plus a currency, never floats
- [ ] No business logic in routes or components
- [ ] Every new table has row-level security, with policies tested
- [ ] No real statement data, account numbers or transaction text in code, fixtures, logs or analytics
- [ ] No transaction data is sent to AI services
- [ ] New domain logic has tests
- [ ] No secrets committed
- [ ] No `any` without a reason in a comment
- [ ] UI changes follow the `midnight-glass` skill and interface text follows the `voice` skill
- [ ] `npm run lint`, `typecheck`, `test` and `build` pass
