# Deck API

Part of [MTGSCAN-288](https://app.plane.so/reilley/browse/MTGSCAN-288/).
This bounded MTGSCAN-273 slice restores deck reads and owner metadata operations.
It does not activate the backend or replace legacy production authority.

```text
GPUI window composition
  native Collection and Decks pages
    account-scoped controllers and session API adapters
      versioned HTTP deck routes
        one backend application and framework-free domain
          verified identity port -> Supabase Auth
          deck persistence ports -> SQLx -> scoped Postgres role and RLS
```

## Contracts

| Method and path | Request | Result |
| --- | --- | --- |
| GET `/api/v1/decks` | No query | The existing `listDecks.reply` contract |
| GET `/api/v1/decks/{deck_id}` | UUID path, no query | The existing `getDeck.reply` contract |
| POST `/api/v1/decks` | `{"name":"My deck"}` | 201 with `{"deck_id":"..."}` |
| POST `/api/v1/decks/{deck_id}/metadata` | `{"action":"rename","name":"My deck"}` | 200 with `null` |
| POST `/api/v1/decks/{deck_id}/metadata` | `{"action":"priority","priority":"low"}` | 200 with `null` |
| POST `/api/v1/decks/{deck_id}/metadata` | `{"action":"used"}` | 200 with `null` |

The canonical read contracts remain in `supabase/decks.ts`.
`crates/api/src/deck_contract.rs` maps domain projections to them.
The explicit `crates/api/fixtures/deck.json` and `decks.json` examples are checked against those schemas.
Rust API and Swift unit checks use the same fixtures.
Request parsing and refusal mapping live in `crates/api/src/decks.rs`.
Unknown body fields and query parameters are refused. UUID spellings normalize before the application call.
No request accepts an owner, attribution or revision assertion.

Refusals have `{"error":{"code":"...","field":null}}`.
The status/code pairs are 400/`invalid_argument`, 401/`unauthenticated`, 403/`forbidden`, 404/`not_found` and 503/`unavailable`.
Invalid fields name `query`, `request`, `deck_id` or `name`.
Another owner's deck and a missing deck both return `not_found`.
Responses have `Cache-Control: no-store`. A 401 also has `WWW-Authenticate: Bearer`.
Malformed or duplicate Authorization headers do not establish a caller.

Gallery rows retain stable IDs, names, advisory priority, commanders in their original order, card counts, revision, last-use time, stored evaluation summary and Needs you count.
The gallery sorts by most recent use, then name ignoring case, then exact name and ID.
Contents retain exact copy IDs and card printing metadata, commander roles and times, current prices, planned-out flags and basic-land counts.
Basic lands are never made into owned copies.
The full stored evaluation remains a projection. These reads never run or replace the judge.
An empty deck has no evaluation.

## Owner operations

The application verifies identity for every operation.
AI-client credentials keep their existing read permission but cannot create decks or change metadata, including last-use time.
Mobile opening a deck explicitly marks it used. A read alone has no write side effect.
The application checks ownership before editing. The adapter also predicates writes by the verified owner and deck ID.

A name has 1 to 64 Unicode scalar values after trimming. Duplicate names remain allowed.
Creation uses medium priority and revision 0.
Rename, priority and last-use edits never write the revision, deck cards, history, basic-land counts, plans or evaluation.
Priority stays advisory. It imposes no allocation restriction.
Failed persistence is an unavailable result, not an empty gallery, missing deck or successful write.

## Persistence and activation boundary

The server additionally requires the secret `DECKS_DATABASE_URL`.
Migration `20270104140000_scope_rust_deck_metadata.sql` creates the passwordless LOGIN role `mtgscan_decks`.
It has no role memberships, inheritance, elevated flags or database ownership.
Its only mutation grants are inserting deck owner/name/priority and updating deck name/priority/last-use time.
It cannot update revisions, mutate deck cards, delete decks or execute legacy mutation functions.
RLS limits user-table reads and writes to the transaction-local verified subject.
Write policies also refuse a `client_id` claim.
Existing attribution triggers derive the actor from that bound subject. Attribution is never returned to mobile.

The adapter rejects a connection under a different role, elevated role flags or role memberships.
Each read uses one read-only repeatable-read transaction for a consistent summary and contents.
Each metadata write uses one transaction. Missing rows do not commit a write.
Both Supabase subject settings are transaction-local, so the pool does not retain an account's context.
SQL and database row mapping remain in infrastructure.
Read-only SQL helpers project existing card counts, basic-land identities and evaluation staleness.
They do not create a second deck judge or a metadata application service.

Password provisioning, hosted migration application, secret delivery, deployment and retirement of old-client authority require their separate reviewed plan and approval.
This source change performs none of those actions.

## Native presentation

Collection remains available beside Decks. Copy deck tags open the selected deck by ID, not by name.
The gallery opens Cards. Deck copy tiles open that exact copy and Close returns to the deck.
That return does not wait for a collection browse request.
Following a copy's deck tag keeps that copy as the immediate return origin.
Account changes clear those return origins.
The loaded banner starts at the top of its page under Close and More.
The header name appears only after the banner scrolls underneath it.
Header icons keep 44-point targets. Group and Sort use the canonical round floating buttons.
Needs you uses the shared round count badge from the canonical theme.
Basic-land counts expand to individual read-only images, not selectable copies.
The empty deck offers Open Collection.
Create and Rename use native name alerts. More offers Rename and the checked advisory Priority submenu.
No deck delete, commander editing, card removal or basic-land mutation controls are added.
Planned and History actions remain outside this slice.

Loading, first failure, empty, refused and loaded states are distinct.
A transient refresh failure keeps same-account content. A refused response clears it.
Account changes clear deck data and invalidate late reads and writes.
A metadata refusal also invalidates an older in-flight read.
Create does not navigate after a failed write.
Names are never optimistic. A successful metadata write reloads the deck.

Group and Sort use native menus. Their choices apply to every deck until restart.
Commanders stay first, ordered by commander time. Main deck cards support Type, Mana value, Color, Rarity and None groups.
Sort supports Name, Mana value, Price and Recently added, with reversal on a second selection.
Missing prices and basic-land addition times stay last in either direction.
The presentation generator reuses existing type groups, rarity and color labels, theme metrics, scrim, sheen and card symbols.
Atomic Design atoms own raw controls. Pages and organisms have no Supabase or storage access.

## Verification limits

New automated coverage is unit-only at application, API and native presentation seams with external effects mocked.
`mise run rust-check` checks compilation, formatting, Clippy, unit behavior and dependency boundaries.
The touched TypeScript checks include the canonical contract fixture and existing deck order behavior.
`mise run native-unit` includes deck controllers and session-bound HTTP adapters.

At the source handoff, native compilation, executable Swift unit checks, Simulator rendering and accessibility are pending the parent's native reservation.
A formatter pass is not a compiler or device acceptance result.
The real SQLx adapter, migration grants, RLS, attribution trigger and transaction behavior still need an isolated synthetic SQL probe and the existing database CI suites.
Mocks and fixtures do not prove those properties.
No owner data, hosted provider configuration or live infrastructure was changed.
