# Project instructions

## Product scope

mtgscan is a cross-platform phone app for rapidly scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. Its authenticated remote MCP service lets compatible AI chats search card and collection data, inspect decks, and make deck suggestions. Remaining product and architecture decisions belong in wayfinding. Do not introduce application code, a technology stack, or architecture decisions before they are settled.

## Context and workflow

- Before creating, updating, or resolving an issue, read `docs/agents/issue-tracker.md`.
- Before applying or changing triage labels, read `docs/agents/triage-labels.md`.
- Before relying on feature behavior, requirement IDs, or verification evidence, read `docs/agents/feature-specs.md` and use its `spec-rag` retrieval workflow.
- Before changing domain documentation, read `CONTEXT.md`.
- For new or behavior-changing features, use the Matt Pocock plugin workflow: `grill-me -> to-tickets -> implement -> code-review`.
- Use `feature-spec` during implementation when a ticket requires a living-spec update. See `docs/agents/feature-specs.md`.
- For exploratory work, use `/wayfinder` and follow the map and child-ticket operations in `docs/agents/issue-tracker.md`.
