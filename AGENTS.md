# Project instructions

## Product scope

mtgscan is a cross-platform phone app for rapidly scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. Its authenticated remote MCP service lets compatible AI chats search card and collection data, inspect decks, and make deck suggestions. Remaining product and architecture decisions belong in wayfinding. Do not introduce application code, a technology stack, or architecture decisions before they are settled.

## Workflow

- For new or behavior-changing features, use the main flow: `grill-with-docs -> to-spec -> to-tickets -> implement -> code-review -> retro`. Use `implement-spec` instead of `implement` to build a whole spec in one run.
- For exploratory work, use `/wayfinder`. When the map clears, continue the main flow at `/to-spec`.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues at `Reilley64/mtgscan`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels are used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
