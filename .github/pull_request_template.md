# {PR Title}

Closes #{issue-number}

## Type of Task
- [ ] New feature
- [ ] Bug fix
- [ ] Refactoring
- [ ] UI/UX improvement
- [ ] Change request

## Description
- What was added/modified
- Why the change was necessary
- Any technical details worth noting

## Testing done
List the tests and commands that were run, with their results.
Agents must not open a PR without proof of testing.

## Evidence
What a reviewer can check without rerunning anything: the commit the checks
ran on, screenshots for UI changes, and output for anything CI can't run.
Don't include real statement data.

## Merge Danger
What could go wrong once this merges, or "None".
- **One-way doors**: any from `CLAUDE.md` that this touches, and why it's safe
- **Rollback**: how to undo this
- **Order**: other PRs or steps this depends on

## Impact
- **UX**: How it affects user experience
- **Performance**: Any performance implications
- **Security**: Security-related impacts
- **Maintenance**: Effects on code maintainability

## Additional Information
Include any supplementary information, setup instructions,
or context that reviewers should know.

## Issues
Document any known issues, limitations, or pending concerns.

## Demo
Include relevant screenshots, GIFs, or video links demonstrating the changes.
