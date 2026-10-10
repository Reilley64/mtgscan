# Project instructions

## Product scope

mtgscan is an iPhone app for scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. The first release is iOS only. Android comes later. An authenticated remote MCP service lets compatible AI chats search card and collection data, inspect decks, and make deck suggestions. `README.md` describes the stack, the setup, and the checks.

## Workflow

- For new or behavior-changing features, use the main flow: `grill-with-docs -> to-spec -> to-tickets -> implement -> code-review -> retro`. Use `implement-spec` instead of `implement` to build a whole spec in one run.
- For exploratory work, use `/wayfinder`. When the map clears, continue the main flow at `/to-spec`.

## Local development

Before you set up a worktree, run the app or the Simulator, start local Supabase, run EAS, add a migration, or merge a PR, read `docs/agents/local-development.md`.

## Code review

Review every diff against `CODING_STANDARDS.md`.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues at `Reilley64/mtgscan`. Before you create, update, or close an issue, or link a PR to one, read `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
