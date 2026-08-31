---
name: feature-spec
description: Create or update one living feature specification, including ticket-driven living-spec updates during implementation.
---

# Feature spec

Use this skill when the user explicitly invokes `feature-spec`, asks you to follow
it, or an approved implementation ticket requires a living-spec update.

## Routing

Ticket-driven implementation:

- Use this automatically during `implement` when the ticket's
  `Living specification impact` action requires creating or updating a spec.
- Treat the approved ticket as authorization for the scoped spec change named by
  its canonical spec path and affected or reserved requirement IDs.
- Do not ask for a second approval unless the ticket, canonical spec, interface
  contract, or implementation is contradictory or ambiguous.
- Keep code, tests, interface contract changes, verification matrix evidence
  status, and spec changes in the same implementation change.

Direct standalone drafting or updates:

- Ask the user to approve proposed verification boundaries before writing a new spec.
- Show the exact draft for a new spec, or a unified diff for an update.
- Wait for approval before writing. Do not silently change an active spec.

## Workflow

1. Read `docs/features/README.md`, `docs/features/_template/spec.md`,
   `docs/agents/feature-specs.md`, root `AGENTS.md`, `CONTEXT.md` if present,
   and relevant ADRs under `docs/adr/`.
2. Identify the feature slug and target path: `docs/features/<feature-slug>/spec.md`.
3. For ticket-driven work, read the full ticket and comments. Confirm the canonical
   spec path, affected or reserved requirement IDs, and action.
4. Explore related code, tests, issue text, interface contracts, and domain language
   before drafting requirements.
5. Draft technology-neutral requirements only. Name actors, outcomes, rules,
   invariants, authorization, validation, failure, recovery, security, privacy, and
   measurable acceptance behavior.
6. Put current defects, missing slices, and implementation quirks in
   `Current limitations`. Do not write them as `shall` requirements.
7. Preserve approved requirement IDs and IDs reserved by published tickets. Retire
   obsolete approved IDs. Other Draft IDs may be renumbered before approval while
   reconciling the requirement set.
8. Write only the canonical feature spec named by the workflow or ticket. Never
   publish a GitHub issue from this skill.
9. Inspect the written file for EARS `shall` requirements, one matrix row per
   requirement, traceability, no manual changelog, no implementation technology,
   and no source or test paths.

Keep the spec concise. Point to issues, PRs, ADRs, tests, and interface contracts instead of copying their content.
