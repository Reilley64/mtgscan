# Collection read API

Part of [MTGSCAN-276](https://app.plane.so/reilley/browse/MTGSCAN-276/).
[MTGSCAN-283](https://app.plane.so/reilley/browse/MTGSCAN-283/) adds collection queries to this bounded collection read slice of MTGSCAN-273.
It does not deploy the service or retire legacy reads.

```text
GPUI page composition
  native collection presentation and Atomic Design controls
    session-authenticated CollectionAPI
      GET /api/v1/collection/copies
      GET /api/v1/collection/copies?query=<encoded JSON>
      GET /api/v1/collection/search-options
      GET /api/v1/collection/copies/{copy_id}
        API contracts -> application collection use cases -> domain owner visibility
          identity port -> Supabase Auth
          read port -> direct Postgres adapter -> scoped reader role and RLS
```

## Contracts

`crates/api/src/collection_contract.rs` owns the result and refusal contracts.
`crates/api/src/collection.rs` owns the versioned GET routes and request validation.
No request accepts an owner or reads a request body.
The copy and search-options routes refuse query parameters.
The copies route accepts either no parameters or one `query` parameter containing URL-encoded JSON.
Its field names are the existing `CollectionQuery` contract from `supabase/collection.ts` and `supabase/search.ts`. There is no string filter grammar on the server.
A copy request takes a UUID in its path. Accepted UUID spellings normalize to the stable copy ID.

Browse without parameters retains `{"copies": [...]}`. Each element uses the same `CopyResult` as the copy route.
A query returns copies, `total_count`, `basic_lands`, `next_cursor`, `search_id`, rules and price freshness, and first-page search options.
`total_count`, `basic_lands`, and search options are null on later pages.
Basic lands are card identities, never copies. Mobile shows them after the last page of copies.
Search options contain only the verified owner's decks and active user tag names. A separate authenticated read supplies them even when a new query supersedes the first page.
`crates/api/fixtures/collection-copy.json` is an explicit example shared by the Rust API and Swift presentation unit checks.
These contracts are not database rows. Owner IDs, caller attribution, credentials, addition IDs, and operational fields are not returned.

A copy carries its stable ID, nested card printing, finish, condition, language, protected flag, addition time, current USD price, purchase-day USD cents, user tags, allocation, and planned hold.
The printing includes its ID, name, set, collector number, rarity, images, art crop, artist, type line, mana cost, face rules text, and Commander legality.
Missing art, artist, prices, allocations, and holds remain null. A missing price never borrows from another finish.

Refusals have `{"error":{"code":"...","field":null}}`.
The status/code pairs are 400/`invalid_request`, 401/`unauthenticated`, 403/`forbidden`, 404/`not_found`, and 503/`unavailable`.
Malformed transport parameters name `query`. An invalid copy ID names `copy_id`.
Canonical query refusals add 400/`invalid_argument`, 400/`invalid_cursor`, and 503/`data_unavailable`.
Query errors retain the exact field path, such as `sets_exclude[1]`, and a safe message.
The framework-free domain validates exact filters, exclusions, bounds, copy states, and known lookup values. API only maps JSON to that vocabulary.
Every positive chip must match. Every excluded chip must not match. Deck IDs retain their existing any-of semantics.
Card chips also match basic lands. A printing or copy chip hides them, including negated chips and false copy flags.
SQL supplies indexed text matches and relevance scores. Rust combines them with chip matching, deterministic ordering, and keyset pagination.
Cursors retain a 15-minute lifetime and bind the query and verified owner. Changing the limit or Oracle-text projection does not change the search identity.
No legacy SQL search function becomes the new application authority.
A missing copy and another owner's copy both return `not_found`.
All responses set `Cache-Control: no-store`. A 401 also sets `WWW-Authenticate: Bearer`.
Duplicate or malformed Authorization headers are refused.

Auth verifies the exact bearer credential with Supabase before the application receives a caller.
The application accepts no claimed owner from presentation.
The domain filters persistence output against that caller as an additional guard.
AI-client credentials keep their existing read permission. This does not grant an MCP transport or new write permission.

## Persistence and configuration

The server needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `COLLECTION_DATABASE_URL`.
The database URL is a backend secret. Never put it in native public configuration.
`LISTEN_ADDRESS` still defaults to `127.0.0.1:8080`.

The migration creates `mtgscan_collection_reader` with LOGIN and no password.
It has no role memberships, inheritance, database ownership, elevated role flags, mutation grants, or app mutation-function grants.
Only columns needed by the read are granted. Plan reasons are not granted.
MTGSCAN-283 grants only the existing text-index, name-normalization, tag-closure, and basic-land read helpers. It grants no legacy search or mutation entry point.
The role has owner-specific RLS policies on user tables and read policies on the required card catalog tables.
Its default transaction is read-only, its search path is empty, and its statement timeout is 15 seconds.

The adapter refuses a connection whose session and current user are not this dedicated role.
It also rejects elevated flags or memberships.
Every read uses one read-only transaction.
It binds the verified subject into transaction-local `request.jwt.claims` and `request.jwt.claim.sub` settings, then also binds the owner in the query.
Both subject settings support existing Supabase helper definitions.
Transaction-local context cannot leak into a later pooled read.
SQL and row mapping stay in `crates/persistence`.

Password provisioning, hosted migration application, TLS connection configuration, and deployment belong to the reviewed MTGSCAN-277/278 plan.
This PR authorizes none of those live changes.

## Mobile behavior

The signed-in account opens a three-column binder. Tapping a tile opens that exact copy.
Close and the left-edge gesture return to the binder and read it again.
Loading, empty, failed, refused, missing-copy, and retry states have distinct presentation output.
An uncached failed read is not an empty success.
A transient refresh failure keeps the last successful same-account content, including an empty result.
A refused read hides account data.
Account changes and sign-out synchronously clear collection output and the copy cache.
Generation guards discard late replies after navigation, reload, or account change.
Successful same-account session revalidation does not invalidate a collection read.
Sign-out and a new sign-in still invalidate the previous session's reads.
Tokens stay inside the existing session controller and network call. They never enter collection presentation models or caches.

The native controls reuse the existing layout and authentication atoms.
Card images and blurred art use a separate HTTPS image capability, with no bearer header, redirect, disk cache, or owner credential.
The Mana font, symbol meanings, symbol metrics, copy labels, gradient stops, aspect ratio, printed-card corners, and palette come from existing mobile sources.
The build generates native presentation data rather than maintaining a second editable symbol or label list.
Text uses Dynamic Type. Interactive controls have at least 44-point touch targets.
The copy header keeps a fixed-size native Close control over the hero.
On iOS 26 and later, the soft system scroll-edge effect protects content after the hero leaves the header.
Older systems use a native material backdrop. Loading and error content reserve space below the header.

This slice shows read-only metadata and USD prices.
Collection queries use the existing mobile chip compiler, filter choices, sort rules, and field-to-chip mapping through a generated JavaScriptCore bundle. Mobile does not link the backend application.
A new query replaces old tiles with loading output. Late query replies cannot replace a newer search or another account.
Returning from a copy restarts the binder at its first page with fresh cursors and resets its scroll position. An expired cursor also restarts the read.
Search text and chips survive copy navigation. The keyboard returns only after a tap on the search field.
Inactive query and copy caches expire after five minutes. Account changes clear both caches and lookup context.
`invalidate()` clears the shared collection caches and refreshes active collection output and search options.
Native query-controller checks and rendering remain pending until the reserved native validation turn is released.
Currency settings and consistent converted-price behavior follow in MTGSCAN-285.
Copy actions and user-tag editing follow in MTGSCAN-286/301. Deck navigation follows in MTGSCAN-288.
The scanner and gallery algorithms are unchanged.

## Verification limits

Run root `mise run rust-check` and `mise run native-unit`.
New automated tests are unit-only. They run real use cases, domain policy, API mapping, session coordination, and collection presentation with fake external Auth, persistence, HTTP, keychain, and native-provider capabilities.
Mutation checks cover owner visibility, metadata mapping, and stale account replies.
They do not prove SQL/RLS, native rendering, VoiceOver, provider configuration, or deployed network behavior.
Existing database CI still applies migrations and runs its existing suites.

MTGSCAN-276 recorded a one-off isolated local Postgres probe of its browse adapter and RLS with synthetic owners.
That probe does not verify the new MTGSCAN-283 query SQL or grants.
The new query adapter still needs an isolated synthetic SQL/RLS check. No hosted data has been used.
MTGSCAN-276 compiled the native build for the existing iPhone 17 Simulator. MTGSCAN-283 has not yet taken the reserved native compiler or device turn.
A visual and spoken accessibility check remains a separate manual gate. Do not use the owner's collection or overwrite unresolved Simulator session state to obtain it.
