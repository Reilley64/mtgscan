# Copy protection and user tags

Part of [MTGSCAN-286](https://app.plane.so/reilley/browse/MTGSCAN-286/).
This slice adds an opt-in Rust development path. It does not activate a hosted writer or retire legacy mutations.

```text
GPUI collection page
  native Atomic controls and OrganizationController
    session-authenticated HTTP adapter
      POST /api/v1/collection/actions
        canonical organization contract
          application organize -> domain protection and name policy
            identity capability -> verified Supabase caller
            transaction capability -> SQLx and scoped Postgres role
```

## Contract

`crates/api/src/organization_contract.rs` is the canonical request/result mapping.
Application commands are framework-free and are not database rows.
Each JSON object has an `action` and only that action's fields. Query parameters and unknown fields are refused.
No owner, client, attribution, or credential field is accepted in the body.
UUID fields must use the 36-character hyphenated spelling. They normalize to lowercase stable IDs.
Names are trimmed and must have 1–64 Unicode scalar values after trimming.

| Action | Fields | Result |
| --- | --- | --- |
| `set_copy_protected` | `copy_id`, `protected` | `copy_id`, `protected` |
| `list_user_tags` | optional `deleted`, default false | `items` with `user_tag_id`, `name`, `copy_count` |
| `create_user_tag` | `name` | `user_tag_id`, `name`; AI replies also include `created` |
| `rename_user_tag` | `user_tag_id`, `name` | `user_tag_id`, `name` |
| `delete_user_tag` | `user_tag_id` | null for a user; AI replies have `user_tag_id`, `changed`, `copy_count` |
| `restore_user_tag` | `user_tag_id` | `user_tag_id`, `name`, `changed`, `copy_count` |
| `set_copy_user_tag` | `copy_id`, `user_tag_id`, `tagged` | null |
| `set_copies_user_tag` | `copy_ids`, `user_tag_id`, `tagged` | `changed` IDs and `skipped` entries with `copy_id`, `reason: "missing"` |

Bulk tagging accepts 1–100 distinct IDs. A repeated ID is refused at `copy_ids[N]`, including another spelling of the same UUID.
All found copies count as changed, including copies already in the requested state.
Missing, deleted, and wrong-owner copies are skipped without disclosing which case applies.
Both result lists preserve request order. A single-copy request instead refuses a missing copy at `copy_id` and commits nothing.
An absent, deleted, or wrong-owner tag refuses the entire tagging request at `user_tag_id`.

Errors have `{"error":{"code":"...","field":"..."}}`. A whole-request error has a null field.
Authentication failures use 401/`unauthenticated`; AI protection uses 403/`mcp_token_forbidden`; capability failures use 503/`unavailable`.
Validation and domain refusals use 400 with `invalid_argument`, `not_found`, `copy_not_free`, or `user_tag_exists`.
A duplicate create/rename names `name`. A restoration conflict names `user_tag_id`.
Replies are not cached. A 401 includes `WWW-Authenticate: Bearer`.

## Shared policy and transaction scope

The application derives owner and actor from verified credentials. It never accepts a claimed owner or audit actor.
Users and AI clients share the tag use cases. A user duplicate create is refused; an AI duplicate create returns the existing active tag without renaming it.
A user repeated delete is refused; an AI repeated delete returns `changed: false` and `copy_count: 0`.
Restoring an active tag is a no-op with its retained copy count.
Neither API nor future MCP wrappers may grant AI protection, copy, or deck mutations.
This slice adds no MCP transport or deck/copy mutation command other than user protection.

Protection locks the exact copy before checking its current allocation and open planned hold.
Only an unallocated, unheld copy can be protected. Already protected free copies can be protected again.
Unprotecting does not require a free copy. Wrong-owner and absent copies are indistinguishable.

One application call owns one transaction. The SQLx transaction rolls back on errors or drop and reports success only after commit.
The adapter binds verified subject and client claims transaction-locally for RLS and the existing attribution trigger.
It serializes organizer requests per owner with a transaction advisory lock, locks the affected tag, and locks exact copy IDs in stable order.
Copy state is read again after acquiring its row lock, not from a mobile read.
Existing legacy allocation and hold writers also lock copies. Postgres retains its unique indexes, foreign keys, triggers and constraints.
The active-name partial unique index remains authoritative, including races with retained legacy writers.
Constraint conflicts are translated to the same field errors, not exposed as raw SQL errors.

Tag deletion changes only the tag's deleted timestamp. It never changes its links.
Detaching changes a link's deleted timestamp; attaching restores that link rather than creating another identity.
Deleted names are reusable by create and rename. Restoration refuses a name now held by another active tag, ignoring case per Postgres.
Restoration brings back exactly the still-existing, non-detached links. Counts omit detached links and copies removed by foreign-key cascade.
Audit timestamps and identities remain trigger-owned. Callers cannot set or replace original creation attribution.

## Mobile behavior

The copy header's native More menu offers Protect or Unprotect for eligible copies.
It sends the exact stable copy ID. A failed write leaves the displayed copy unchanged until revalidation and shows the existing native failure alert.
A stale allocation or hold is refused by the backend and reread, not guessed by the control.

The User tags row opens a pushed picker with Back and the left-edge gesture.
The picker filters loaded names immediately. It supports create-and-attach, attach/detach, inline rename, counted delete confirmation, and a Deleted user tags section with Restore.
Inputs have a 64-character limit, native text entry, Dynamic Type, keyboard avoidance, and token-derived touch targets.
Rename field errors retain the editor. Loading, failed reads, failed writes, and empty tags have distinct output.
A missing copy returns to the copy page. Account changes and sign-out discard tag output and late replies.

Create-and-attach deliberately remains two requests, as in the baseline. A created tag is retained if attachment fails.
The picker rereads tags and invalidates copy/query state after that partial success. It does not claim a combined transaction or retry a user create as an AI create.
Successes and uncertain write failures invalidate collection copy caches, browse state and tag counts. The copy is reread and its selected-tag state is reconciled.
Controls never read Supabase or storage. Tokens remain inside the session/network adapter.

## Opt-in configuration and remaining gates

`ORGANIZATION_DATABASE_URL` is optional and server-only. Without it, no action route is installed.
When present, it must connect directly as `mtgscan_collection_organizer`, without elevated flags or role memberships.
The additive migration creates that role without a password. It grants only the required select, tag insert/update, link insert/update, and protection-column update capabilities, with owner RLS.
It grants no delete, deck writes, general copy writes, or legacy mutation-function execution.
The read-only collection role and published migrations are unchanged.

Do not provision or enable this role against hosted data until coordinated authority cutover and explicit approval.
The role's credential, TLS configuration, hosted migration and legacy-route revocation remain deployment gates.
The migration adds no API function or public table shape, so it changes no generated database contract type.

New automated tests are unit-only with fake external identity, persistence, transactions, HTTP and session capabilities.
Rust mutation evidence covers held-copy refusal, AI refusal, restoration conflicts, restoration persistence, commit enforcement and forged fields.
Mocks do not prove actual Postgres permissions, transaction isolation, constraints, trigger attribution, or native rendering.
Existing database PR checks must apply the migration and retain their full suites.
Native unit compilation, full native build, isolated synthetic device checks, VoiceOver and text/keyboard checks remain pending under MTGSCAN-279's reserved compiler/device turn.
