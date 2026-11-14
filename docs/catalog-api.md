# Catalog queries

Part of [MTGSCAN-284](https://app.plane.so/reilley/browse/MTGSCAN-284/).

The native catalog is separate from collection search and from the recognizer's local gallery name search.
It does not identify scans, replace the gallery, change a scan, or add a copy.

## Boundary

```text
CatalogPage and shared native controls
  SessionCatalogService and CatalogAPI
    POST /api/v1/catalog/{search,cards,printings,oracle-tags}
      API adapter
        application::catalog::query_catalog
          verified caller and canonical request validation
          ReadCatalog
            SQLx and the existing catalog search engine
```

`mtgscan-catalog-contract` owns the serializable query, result, and refusal models.
These are operation contracts, not database rows or domain aggregates.
Application and adapter code use the same models.
The domain still has no framework or serialization dependency.
A future MCP adapter can parse with `CatalogOperation` and call the same application entry point.
No MCP server or second catalog application service is added here.

## Requests

Each route takes its query as the JSON body, without a wrapper or owner parameter.
It requires one verified bearer credential. User and AI-client credentials keep read permission.
Responses use `Cache-Control: no-store` because catalog results include owned quantities.
No database credential reaches mobile.

- `search` takes the catalog text, positive and negated filters, sort, limit and cursor from the existing catalog contract.
- `cards` takes either `oracle_ids` or `printing_ids`, with 1 to 20 IDs. It keeps request order and `not_found` IDs.
- `printings` takes `oracle_id`, optional `owned_only`, limit and cursor.
- `oracle-tags` takes text and an optional limit. These are public Oracle tags, not private user tags.

For example:

```json
{"text":"ring","types_exclude":["Creature"],"include_oracle_text":true,"limit":20}
```

Prices and price bounds stay in USD. `price_currency` is refused, including `USD`.
A refusal has `error.code` and a nullable `error.field`, such as `tags[0]`.
Authentication failures use 401 or 403. Invalid arguments and cursors use 400.
A missing printing-list card uses 404. Missing catalog data and unavailable services use 503.
An unavailable service is not an empty result or a missing card.

## Persistence

The adapter uses the existing `COLLECTION_DATABASE_URL` and its dedicated `mtgscan_collection_reader` role.
The migration `20270104110000_enable_rust_catalog_queries.sql` adds only catalog reads, scoped helper execution and access to the existing security-invoker availability view.
Existing owner RLS policies still apply to copies, allocations and open holds.
The adapter binds the owner and optional AI-client ID from the verified caller in a transaction-local claims context.
Request fields cannot supply that context.

### Reader provisioning

A migration record does not prove that an Auth grant took effect.
The pinned local Supabase image gives the migration role Auth usage without grant option.
Its Auth grants can warn and leave the reader without schema usage.
The adapter checks effective schema usage and Auth function execution when it connects.
It refuses incomplete provisioning before serving requests.

After the migrations, an authorized Auth schema and function grantor must run
[`supabase/provision/collection-reader-auth.sql`](../supabase/provision/collection-reader-auth.sql).
The file grants only Auth schema usage and execution of `auth.uid()` and `auth.jwt()` to the existing reader.
It changes no role flags, memberships, table permissions, helper security mode or RLS.
It checks grant authority first and verifies the effective grants in one transaction.
Do not repeat the grant as an ordinary migration role that lacks grant option.

For an approved isolated local stack, use its existing Auth owner connection and this file.
For hosted setup, establish that owner's authorized provisioning path in MTGSCAN-277/278 first.
Do not use the reader or an owner connection interchangeably in the application.
Do not grant broader Auth grant option to the ordinary migration role.
Hosted provisioning and activation still require their own approval.

The existing SQL engine remains infrastructure. It retains full-name and face-name ranking, text and filter execution, cursor hashes and expiry, printing order, disabled Oracle tags, tag closure and counts, absent-but-owned printings, free quantities, prices and freshness.
The transport adapters do not copy that engine.
Canonical Rust validation checks request shape and static field constraints before execution.
The SQL engine retains its existing validation for legacy callers and live catalog vocabulary checks.

Only catalog search starts a read-write transaction, so the existing first-page telemetry function can run.
The role has no direct insert, update or delete grant for user data or telemetry.
Card, printing and Oracle-tag reads use read-only transactions.
The existing security-definer telemetry helper records the verified user and app or AI caller.
It does not expose telemetry reads to this role.

Card and printing replies retain the existing fields.
A selected printing and each printing-list row also include `image_uris`, `art_crop_uri` and `artist` for native presentation.
The adapter reads that artwork in the same scoped transaction without changing the legacy database function replies.

## Native interactions

Collection opens **Search card catalog**. **Collection** returns without replacing the collection browser.
The catalog has text search, explicit filter fields, Oracle-tag suggestions, server-ordered results and **Load more**.
Text search and Oracle-tag suggestions wait 300 ms after typing.
The filter controls do not parse the collection chip grammar or change local gallery name search.
Lists use comma-separated values. `[]` represents an empty color-identity subset.

Opening a result loads its rules and printing list.
The user can select a printing, inspect its finishes, and choose **Owned only** for the printing list.
Card symbols, artwork, finish sheen, labels, Dynamic Type and touch targets reuse the native Atomic Design components and generated mobile tokens.
Search transitions invalidate earlier replies. Account changes clear queries and owned results.
Invalidating a read also releases its pagination busy state. An obsolete completion cannot clear a newer page's busy state.
Returning to Collection reads it again while retaining its shown content on a transient failure.
Failures retain successful data for the same query where possible and offer **Try again**.
An expired result cursor restarts from the first page on retry.

## Verification limits

New automated tests are unit-only. They exercise the real application and API with external identity and persistence substituted, and native controllers and HTTP mapping with external services substituted.
The shared JSON examples in `crates/api/fixtures/catalog-*.json` also exercise native decoding.
They are synthetic contract examples, not evidence of actual SQL ranking or RLS.

Real grants, RLS, telemetry, query ordering, cursor expiry and live catalog vocabulary require an isolated synthetic database check.
Native compilation, keyboard behavior, VoiceOver, text scaling and the GPUI composition require the reserved native validation turn.
These manual checks do not require owner collection data, a hosted mutation or a new automated integration suite.
