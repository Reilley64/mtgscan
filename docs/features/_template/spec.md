# <Feature name> specification

Status: Draft

Spec path: `docs/features/<feature-slug>/spec.md`

This spec follows the tailored project profile in `docs/features/README.md`. The project does not claim full ISO/IEC/IEEE 29148:2018 conformance.

## Overview

Describe the feature in a few sentences. State the user or system outcome, not the planned implementation.

## Scope

### In scope

- <Behavior this spec owns.>

### Out of scope

- <Related behavior this spec does not own.>

## Actors and external systems

- <Actor or external system>: <Role in this feature.>

## Terms

Use project terms from `CONTEXT.md` when they exist.

| Term | Meaning |
| --- | --- |
| <Term> | <Meaning in this feature.> |

## Assumptions and constraints

- <Assumption or constraint that affects the requirements.>

## Current limitations

- <Current defect, missing slice, partial coverage, or implementation quirk that must not become a requirement.>

## Requirements

Requirements must be stable, singular, technology-neutral, traceable, verifiable, and measurable. Use EARS `shall` statements. Do not use RFC 2119 keywords.

### Functional requirements

#### <FEATURE-SLUG-UPPER>-REQ-001: <Short requirement name>

When <trigger>, <feature> shall <verifiable outcome>.

### Quality requirements

#### <FEATURE-SLUG-UPPER>-REQ-002: <Short requirement name>

<feature> shall <verifiable quality outcome>.

## Verification matrix

| Requirement ID | Verification method | Evidence target | Status |
| --- | --- | --- | --- |
| <FEATURE-SLUG-UPPER>-REQ-001 | Test | <observable boundary or outcome to verify> | Planned |
| <FEATURE-SLUG-UPPER>-REQ-002 | Inspection | <security, privacy, accessibility, or operational review outcome> | Planned |

Verification methods: test, inspection, demonstration, or analysis. Evidence statuses
are defined in `docs/features/README.md`: Existing, Partial, Gap, and Planned.

## Traceability

Downstream issues, PRs, interface contracts, tests, and review records reference requirements by their stable IDs.

- Related ADRs: <ADR path or none>
- Related design records: <design document path or none>
- Related feature specs: <feature names and requirement IDs or none>
- Related interface contracts: <contract names or none>

## Retired requirements

Move obsolete requirements here. Keep their IDs, reason, retirement date, and replacement ID if one exists.

| Requirement ID | Retirement date | Reason retired | Replacement ID |
| --- | --- | --- | --- |
| <FEATURE-SLUG-UPPER>-REQ-000 | <YYYY-MM-DD> | <Reason> | <Replacement or none> |
