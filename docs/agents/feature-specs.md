# Feature specs

Feature specs live under `docs/features/`. Read `docs/features/README.md` before creating or changing one.

## Primary AI feature workflow

Use `grill-me -> to-tickets -> implement -> code-review` for new features and
behavior-changing feature work. The Matt Pocock plugin provides these four skills;
the repository configures their project behavior without registering local copies.

There is no separate mandatory spec-drafting stage. `feature-spec` is supporting
guidance inside implementation when a ticket requires a living-spec update.

Stage roles:

- `grill-me` resolves the feature boundary, outcomes, domain rules, failure
  behavior, non-goals, verification boundaries, and decisions. Its conversation
  feeds `to-tickets` directly.
- `to-tickets` creates vertical implementation tickets. Follow
  `docs/agents/issue-tracker.md` for living-spec impact fields, new-feature
  requirement ID reservation, and ticket acceptance criteria.
- `implement` treats living-spec work as part of done. Code, tests, interface
  contract changes, and spec changes land together. If the ticket, canonical
  spec, interface contract, and code disagree, stop for clarification instead of
  changing approved behavior silently.
- `code-review` reviews Standards and Spec. The Spec axis compares the diff with
  both the ticket and the canonical living spec. Missing or inaccurate required
  spec updates are findings.

## Stage completion rules

`grill-me` is complete only when the conversation records:

- feature boundary and non-goals;
- user or system outcomes;
- domain rules, invariants, ownership, authorization, validation, failures, and
  recovery behavior;
- verification boundaries and evidence expectations;
- all in-scope feature decisions settled;
- each deliberately deferred decision marked out of scope with an owner and next step;
- the settled outcome ready to pass directly to `to-tickets`.

`to-tickets` is complete only when the approved ticket set:

- slices work vertically, so each ticket delivers observable behavior;
- includes a `Living specification impact` section on every behavior-changing
  feature ticket;
- reserves one feature slug, one canonical spec path, and stable requirement IDs
  across a new-feature ticket set;
- makes the first vertical ticket create the Draft spec and its assigned
  requirements;
- makes later tickets extend or update the same spec;
- makes the final ticket verify the complete approved feature and promote Draft
  to Active only when all approved behavior is delivered and evidenced;
- avoids a horizontal spec-only ticket;
- requires implementation to update the living spec, verification matrix and
  evidence status, tests, and interface contract when applicable.

`implement` is complete only when the ticket's scoped behavior, code, tests,
interface contract changes, and living-spec changes agree. For cited requirements,
update the requirement text when needed and update the verification matrix evidence
status. Existing bug fixes may state no spec change only under the concrete-reason
policy in `docs/agents/issue-tracker.md`.

`code-review` is complete only when it reports Standards and Spec results side by
side. A Spec review must check the ticket, the canonical spec path, affected
requirement IDs, verification matrix evidence status, tests, and interface contract
changes when applicable.

## feature-spec routing

Use `feature-spec` automatically during `implement` when a ticket requires a
living-spec update.

For ticket-driven implementation, the approved ticket authorizes the scoped spec
change. Do not require a second approval unless the ticket, canonical spec,
interface contract, or implementation is contradictory or ambiguous.

For direct standalone drafting or updates, preserve the explicit approval gate. Show
the proposed new spec or diff and wait for approval before writing.

## Spec retrieval

Use the `spec-rag` MCP server when implementation, review, planning, or issue work
depends on feature behavior, requirement IDs, current limitations, or verification
evidence.

| Need | Tool |
| --- | --- |
| Find relevant behavior by topic | `search_feature_specs` |
| Resolve an exact active requirement ID | `get_requirement` |
| Load one feature's context and limitations | `get_feature` |
| Find incomplete verification evidence | `list_evidence_gaps` |
| Diagnose unexpected or stale results | `get_index_status` |

Treat retrieval as discovery. Read the returned canonical
`docs/features/<feature-slug>/spec.md` before editing it or making a completeness
claim. The Markdown file is the contract; the index is a disposable in-process
retrieval copy. If the MCP server is unavailable, locate and read the canonical files
directly. Retrieval is complete when the relevant requirement IDs, limitations,
and evidence statuses have been accounted for.

## Consumer rules

- Main branch specs describe delivered behavior.
- A feature branch spec describes the intended behavior after merge.
- Code and spec changes move together.
- Tickets request changes. They are not the canonical feature contract.
- Feature specs define product and domain behavior, not implementation technology.
- Interface contracts and transport tests own protocol, message shape, encoding,
  status, header, and serialization details.
- Current defects and implementation quirks belong in `Current limitations`, not in
  `shall` requirements.
- Every behavior-changing ticket must create or update the affected feature spec.
- Bug fixes that restore existing specified behavior may skip a spec change only
  when the ticket records the existing spec path, affected requirement IDs, and a
  concrete reason.
- Tickets and PRs must reference the feature spec path and affected requirement IDs.
- Preserve approved requirement IDs and IDs reserved by published tickets. Other
  Draft IDs may renumber before approval; approved specs retire IDs instead of
  reusing or renumbering them.
