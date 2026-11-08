# How AI agents work on this repo

Decided: 2026-10-31

AI agents write much of this code, the repo is public, and the data is private. So agents run only in the owner's local sessions: there's no Claude bot, workflow or token on GitHub, and GitHub Actions holds no secrets. Agents may open PRs, only with proof of testing, but never approve or merge them. One-way doors, the changes that are hard or impossible to undo, need the owner's go before building and a line in the PR's Merge Danger section. Agents see screens only through the local sandbox, on synthetic rows. The rules themselves live in [CLAUDE.md](../../CLAUDE.md), and this record doesn't repeat them.
