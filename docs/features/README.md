# Living feature specifications

This directory holds the project's living feature specifications. Each spec is a concise, technology-neutral contract for one feature.

The project uses a tailored profile inspired by ISO/IEC/IEEE 29148:2018 and EARS. It does not claim full conformance with ISO/IEC/IEEE 29148:2018 or any related standard.

Official references:

- ISO/IEC/IEEE 29148:2018, "Systems and software engineering, Life cycle processes, Requirements engineering": https://doi.org/10.1109/IEEESTD.2018.8559686
- EARS guide by Alistair Mavin: https://alistairmavin.com/ears/
- "Easy Approach to Requirements Syntax (EARS)": https://doi.org/10.1109/RE.2009.9

## Project profile

A feature spec defines externally meaningful behavior that code must preserve. It names actors, outcomes, domain rules, invariants, state behavior, authorization and ownership rules, validation outcomes, failure and recovery behavior, security and privacy properties, and measurable acceptance behavior.

A feature spec does not prescribe frameworks, libraries, vendors, languages, protocols, serialization, identifier encodings, timestamp formats, storage mechanisms, transaction technologies, source paths, test paths, or deployment components. Generated interface contracts and transport tests own protocol-level details when they exist.

Use this profile instead of the full 29148 document set:

- Put one feature in one directory: `docs/features/<feature-slug>/spec.md`.
- Start new specs from `docs/features/_template/spec.md`.
- Write requirements as stable, singular, technology-neutral statements.
- Use EARS-style `shall` requirements. Do not use RFC 2119 keywords such as `MUST`, `SHOULD`, or `MAY`.
- Put observable current defects or implementation quirks in `Current limitations`, not in normative requirements.
- Trace each behavior-changing issue or PR to the spec path and affected requirement IDs.
- Verify each requirement through the verification matrix in the spec.
- Rely on repository history. Do not add a manual changelog to specs.

## Interface contracts

Feature specs and interface contracts have different jobs.

Feature specs own product and domain behavior. They can say that a machine-facing interface returns an invalid-input outcome or that a status read returns unambiguous timestamps.

Generated interface contracts, transport tests, and client compatibility suites own transport details. They define paths, message shapes, serialization, status codes, headers, cookies, encodings, and concrete timestamp formats. Keep those details out of feature specs unless a user-visible domain rule truly depends on them.

## Current limitations

Use `Current limitations` for behavior that exists today but should not become a permanent contract. This includes reachable defects, missing slices, partial coverage, accidental framework behavior, and implementation-specific quirks.

A limitation should be specific enough to guide follow-up work. It should not use `shall`, and it should not appear in the verification matrix as a requirement.

## Requirement IDs

Requirement IDs are permanent after a spec is approved. IDs reserved by published tickets are also permanent. Other Draft IDs may be renumbered before approval when the requirement set is being reconciled.

Use this format:

```text
<FEATURE-SLUG-UPPER>-REQ-001
```

For example, `CARD-COLLECTION-REQ-001`.

Rules for approved specs:

- Keep the ID when the requirement keeps the same intent.
- Add a new ID for a new independent requirement.
- Retire obsolete requirements by moving them to the "Retired requirements" section with the reason and replacement ID, if any.
- Do not renumber active requirements.
- Do not reuse retired IDs.

## EARS syntax

Each requirement uses one of these forms. Replace bracketed text with project terms.

### Ubiquitous requirements

Use this for behavior that always applies.

```text
<feature> shall <response>.
```

Example:

```text
A collection shall present its recorded cards.
```

### Event-driven requirements

Use this when a trigger causes a response.

```text
When <trigger>, <feature> shall <response>.
```

Example:

```text
When a user records a card, collection management shall retain the card record.
```

### State-driven requirements

Use this when behavior applies only in a state.

```text
While <state>, <feature> shall <response>.
```

Example:

```text
While a deck is being viewed, deck viewing shall present the deck.
```

### Unwanted behavior requirements

Use this for error and exception behavior.

```text
If <unwanted condition>, then <feature> shall <response>.
```

Example:

```text
If a card scan cannot be read, then card scanning shall report that outcome.
```

### Optional feature requirements

Use this when behavior depends on a configuration or selected capability.

```text
Where <option or capability>, <feature> shall <response>.
```

Example:

```text
Where a deck viewing connection is available, deck viewing shall expose the deck.
```

### Complex requirements

Combine clauses only when one response genuinely depends on multiple conditions.

```text
While <state>, when <trigger>, <feature> shall <response>.
```

If the statement has more than one independent response, split it.

## Requirements workflow

Build and maintain a feature spec in this order:

1. Define the feature boundary, actors, external systems, terms, assumptions, and constraints.
2. Read relevant `CONTEXT.md` entries and ADRs before choosing requirement language.
3. Derive singular EARS requirements from user outcomes, domain rules, ownership rules, validation outcomes, failure cases, security needs, privacy needs, and operational guarantees.
4. Move accidental defects and implementation quirks to `Current limitations`.
5. Review the requirement set for necessity, consistency, completeness, feasibility, ambiguity, and technology neutrality.
6. Define a verification method and observable evidence target for every requirement before implementation begins.
7. For standalone drafting, obtain explicit user approval for the requirement set and verification seams before treating the spec as the implementation contract.
8. For ticket-driven implementation, treat the approved ticket set as authorization for its scoped spec changes. Ask for clarification only when the ticket, spec, interface contract, or implementation conflicts or is ambiguous.
9. Update the spec, implementation, interface contracts, and verification evidence together when intended behavior changes.

## Requirement quality rules

A requirement must be:

- Stable. Its ID remains valid across edits until the requirement is retired.
- Singular. It states one required behavior.
- Technology-neutral. It names the required outcome, not a framework, library, vendor, source path, test path, storage mechanism, protocol, encoding, serialization, or deployment component.
- Traceable. It lists related issues, PRs, ADRs, design records, feature specs, or interface contracts where useful.
- Verifiable. A test, inspection, demonstration, or analysis can prove whether the system satisfies it.
- Necessary. It belongs to the feature contract, not to temporary implementation planning.
- Unambiguous. Project terms match `CONTEXT.md` and relevant ADRs.
- Measurable. Success and failure outcomes can be observed at a domain, application, interface, or user-experience boundary.

Avoid:

- Multiple obligations joined by "and" unless they form one atomic behavior.
- Vague words such as "fast", "secure", "easy", "robust", or "appropriate" without a measurable test or review rule.
- Design choices that belong in architecture docs, ADRs, plans, interface contracts, or code comments.
- Restating code structure.
- Turning current defects or accidental quirks into permanent requirements.

## Verification evidence statuses

Use one status for each verification-matrix row:

- Existing. Evidence at the stated method and intended verification boundary supports
  the requirement.
- Partial. Some evidence exists, but it does not cover the whole requirement or the
  approved verification boundary.
- Gap. No adequate evidence currently verifies the requirement.
- Planned. The requirement is proposed and its evidence does not exist yet.

Code existence alone is not test evidence. Inspection can be Existing when the
requirement is appropriately verified by inspection.

## Lifecycle

A spec can be in one of these states:

- Draft. The contract is not approved yet. It may describe planned behavior or delivered behavior that is still being reconciled with the code and other contracts.
- Active. The approved contract matches behavior delivered on `main`, or its implementation branch is ready to merge with the spec.
- Retired. The feature no longer exists on `main`.

On `main`, active specs describe delivered behavior. On a feature branch, an existing active spec describes the behavior intended after merge. Code and spec changes move together.

## Layout

Use this directory shape:

```text
docs/features/
├── README.md
├── _template/
│   └── spec.md
└── <feature-slug>/
    └── spec.md
```

A feature spec should keep this section order unless there is a clear reason to add a local section:

1. Overview
2. Scope
3. Actors and external systems
4. Terms
5. Assumptions and constraints
6. Current limitations
7. Requirements
8. Verification matrix
9. Traceability
10. Retired requirements

## Agent workflow

The primary AI feature workflow is the plugin-provided
`grill-me -> to-tickets -> implement -> code-review`.

Use `feature-spec` as supporting guidance during implementation when a ticket requires
a living-spec update. Do not add a separate mandatory spec-drafting stage.

See `docs/agents/feature-specs.md` for stage completion rules. See
`docs/agents/issue-tracker.md` for ticket fields, requirement ID reservation, and
new-feature spec lifecycle rules.

## Issue and PR workflow

Tickets request changes. Feature specs are the canonical feature contract.

Every behavior-changing feature ticket must include a `Living specification impact`
section with a canonical spec path, affected or reserved requirement IDs, and exactly
one action. Create or update a spec when the ticket changes intended behavior.

Reviewers check that code, tests, interface contracts, and the spec agree before merge.
