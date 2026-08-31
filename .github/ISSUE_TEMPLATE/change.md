---
name: Change
about: Request an implementation or behavior change
title: ""
labels: "needs-triage"
assignees: ""
---

## Summary

Describe the requested change and the user or system outcome.

## Living specification impact

Canonical spec path: `docs/features/<feature-slug>/spec.md`
Affected or reserved requirement IDs: `<FEATURE-SLUG-UPPER>-REQ-001`
Action: Create or update the spec in the implementation PR.

Use exactly one action:

- `Action: Create or update the spec in the implementation PR.`
- `Action: No spec change. Reason: <concrete reason>.`

Tickets request changes. They are not the canonical feature contract.

## Acceptance criteria

- [ ] <Observable outcome.>
- [ ] The implementation PR updates the feature spec, verification matrix, and
  evidence status when the living-spec impact action requires it.
- [ ] The implementation PR adds or updates tests at the agreed verification boundary.
- [ ] The implementation PR updates the interface contract when applicable.
- [ ] The implementation stops for clarification if the ticket, spec, interface
  contract, or code conflicts.

## Notes

Add links, constraints, logs, screenshots, or related context.
