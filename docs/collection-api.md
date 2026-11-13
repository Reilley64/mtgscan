# Collection read API

Part of [MTGSCAN-276](https://app.plane.so/reilley/browse/MTGSCAN-276/).
This is the bounded collection browse and copy page slice of MTGSCAN-273.
It does not deploy the service or retire legacy reads.

```text
GPUI page composition
  native collection presentation and Atomic Design controls
    session-authenticated CollectionAPI
      GET /api/v1/collection/copies
      GET /api/v1/collection/copies/{copy_id}
        API contracts -> application collection use cases -> domain owner visibility
          identity port -> Supabase Auth
          read port -> direct Postgres adapter -> scoped reader role and RLS
```

## Contracts

`crates/api/src/collection_contract.rs` owns the result and refusal contracts.
`crates/api/src/collection.rs` owns the versioned GET routes and request validation.
Neither request accepts an owner, filters, or query parameters. No request body is read.
A copy request takes a UUID in its path. Accepted UUID spellings normalize to the stable copy ID.

Browse returns `{"copies": [...]}`. Each element uses the same `CopyResult` as the copy route.
`crates/api/fixtures/collection-copy.json` is an explicit example shared by the Rust API and Swift presentation unit checks.
These contracts are not database rows. Owner IDs, caller attribution, credentials, addition IDs, and operational fields are not returned.

A copy carries its stable ID, nested card printing, finish, condition, language, protected flag, addition time, current USD price, purchase-day USD cents, user tags, allocation, and planned hold.
The printing includes its ID, name, set, collector number, rarity, images, art crop, artist, type line, mana cost, face rules text, and Commander legality.
Missing art, artist, prices, allocations, and holds remain null. A missing price never borrows from another finish.

Refusals have `{"error":{"code":"...","field":null}}`.
The status/code pairs are 400/`invalid_request`, 401/`unauthenticated`, 403/`forbidden`, 404/`not_found`, and 503/`unavailable`.
Invalid query fields name `query`. An invalid copy ID names `copy_id`.
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
Only columns needed by the read are granted. Private schema helpers and plan reasons are not granted.
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
A failed read is not an empty success. A refused read hides account data.
Account changes and sign-out synchronously clear collection output and the copy cache.
Generation guards discard late replies after navigation, reload, or account change.
Tokens stay inside the existing session controller and network call. They never enter collection presentation models or caches.

The native controls reuse the existing layout and authentication atoms.
Card images and blurred art use a separate HTTPS image capability, with no bearer header, redirect, disk cache, or owner credential.
The Mana font, symbol meanings, copy labels, gradient stops, aspect ratio, and palette come from existing mobile sources.
The build generates native presentation data rather than maintaining a second editable symbol or label list.
Text uses Dynamic Type. Interactive controls have at least 44-point touch targets.

This slice shows read-only metadata and USD prices.
Search, filters, order controls, and pagination follow in MTGSCAN-283.
Currency settings and consistent converted-price behavior follow in MTGSCAN-285.
Copy actions and user-tag editing follow in MTGSCAN-286/301. Deck navigation follows in MTGSCAN-288.
The scanner and gallery algorithms are unchanged.

## Verification limits

Run root `mise run rust-check` and `mise run native-unit`.
New automated tests are unit-only. They run real use cases, domain policy, API mapping, session coordination, and collection presentation with fake external Auth, persistence, HTTP, keychain, and native-provider capabilities.
Mutation checks cover owner visibility, metadata mapping, and stale account replies.
They do not prove SQL/RLS, native rendering, VoiceOver, provider configuration, or deployed network behavior.
Existing database CI still applies migrations and runs its existing suites.

The implementation record includes a one-off isolated local Postgres probe of the real adapter and RLS with synthetic owners.
It is not a new checked-in integration suite or evidence of hosted deployment.
The native build compiles for the existing iPhone 17 Simulator.
A visual and spoken accessibility check remains a separate manual gate. Do not use the owner's collection or overwrite unresolved Simulator session state to obtain it.
