# Sets API

Part of [MTGSCAN-287](https://app.plane.so/reilley/browse/MTGSCAN-287/).

The converted mobile screens read the versioned HTTP API. They do not read Supabase or link backend application code. API and future MCP callers use the same Rust Sets use cases. The legacy app and SQL remain a reference until coordinated cutover. This change does not activate a hosted service.

## Requests

- `GET /api/v1/sets?finish_view=any` lists sets. `finish_view` is required and accepts `any`, `nonfoil`, or `foil`.
- Optional `text` matches a set name or code without case. It accepts 1 to 100 characters. The mobile search waits 300 ms, except that clearing or Cancel reads at once.
- Optional `limit` accepts 1 to 50. It defaults to 20. Mobile uses 20.
- Optional `cursor` continues the same search and finish view. Treat it as opaque. An unknown cursor or a cursor from another search or finish view returns `invalid_cursor`. Restart without it.
- `GET /api/v1/sets/{code}` reads one released set. It takes no query fields.
- Both require one Bearer credential. The verified caller determines the owner. Unknown fields, duplicate fields, and owner assertions are rejected. AI clients retain read permission.
- Successful and refused HTTP responses use `Cache-Control: no-store`.

The list returns `items` and `next_cursor`. Each item has `code`, `name`, `released_at`, `icon_svg_uri`, `set_art_uri`, and `completion`. Completion has `any`, `nonfoil`, and `foil`, each with `owned` and `size`.

The set page adds `main_set`, `variants`, `sections`, and `other`. Each group has completion and `card_printings`. Sections keep Scryfall's order and can overlap. Other cards are the printings in no section. Each printing has its ID, name, collector number, image URI, available finishes, and the three finish-view copy counts. A null count means unavailable in that view. Switching the set page's finish view needs no new request. The native keychain keeps the shared choice across restarts.

## Policy and persistence

Rust excludes absent printings and basic lands, decides main-set membership, counts unique printings, selects art from current prices, and leaves empty main sets out of the list's finish view. Printings sort by numeric collector-number prefix, then collector number. Sets sort by release date descending, then name and code.

Nonfoil counts only nonfoil copies unless that printing has no nonfoil finish. Then every copy counts. Foil counts foil and etched copies and excludes printings with neither finish. Condition, language, protection, allocation, and holds do not affect completion. Copy quantity affects a tile's badge, not completion.

Art uses the highest current USD price in any finish among main-set and variant printings with an art crop. Ties and unpriced fallbacks use collector order. No price history or currency conversion changes are made.

The Postgres adapter reads narrow batches of set printings through the existing dedicated read-only role. Migration `20270104130000` grants the required catalog columns and RLS policies. Each owner read binds transaction-local verified caller context and an explicit owner predicate. It makes no collection writes. Apply it only through the separately approved migration process.

## Errors and validation limits

The canonical body is `{"error":{"code":"unavailable","field":null}}`. Codes are `unauthenticated` (401), `forbidden` (403), `not_found` (404), `unavailable` (503), `invalid_request` (400), and `invalid_cursor` (400). Invalid requests identify the field when available. Upstream messages and credentials are never included.

Unit tests run real application, domain, API, and mobile controller behavior with external identity, database, keychain, clock, and HTTP capabilities substituted. They do not prove SQL grants/RLS, real keychain behavior, UIKit compilation or layout, spoken VoiceOver behavior, or native navigation. Those remain separate manual/native checks.
