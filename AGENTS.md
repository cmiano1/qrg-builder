## Agent skills

### Issue tracker

GitHub Issues in `cmiano1/qrg-builder` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`GLOSSARY.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.

### Subagent worktrees

Create isolated ticket worktrees via `git worktree add -b <branch> <worktree-path> <base>` and invoke subagents with `Workspace: "inherit"`. When a ticket does not modify `qrg-builder/kit/package.json`, symlink `qrg-builder/kit/node_modules` from the integration checkout instead of re-running `npm ci`.

