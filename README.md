# mtgscan

An iPhone app for scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. The first release is iOS only. Android comes later. An authenticated remote MCP service lets compatible AI chats search the card catalog and collection, inspect decks, and make deck suggestions.

## Development

The repo is a Bun workspace. The Expo app lives in `apps/mobile`. The public website, with the homepage and privacy policy, is static HTML in `apps/site`.

1. Install dependencies with `bun install`.
2. Build and open the development build in the iOS simulator with `bun run --filter @mtgscan/mobile ios`.

Public build-time settings go in `apps/mobile/.env`. `apps/mobile/.env.example` lists their names. Never put a service role key in the app.

Checks run on every pull request. Run them locally with `bun run typecheck`, `bun run lint`, and `bun run test`.

### Local Supabase

The Supabase project lives in `supabase`: configuration, SQL migrations, generated types, and database tests. The local stack needs Docker and the Supabase CLI 2.120.0.

1. Copy `supabase/.env.example` to `supabase/.env` and fill in the Google client IDs, web ID first, then iOS ID, separated by a comma. Native Google sign-in does not use the secret. The Apple provider needs no setting. Its client ID is the bundle ID, `dev.reilley.mtgscan`. Native Sign in with Apple does not use a secret.
2. Start the stack from the repo root with `bunx supabase@2.120.0 start`. Stop it with `bunx supabase@2.120.0 stop`.
3. Run the database tests with `bun run test:database`.
4. After you change a migration, run `bunx supabase@2.120.0 db reset` and then `bun run types:database`. CI fails when `supabase/database.types.ts` does not match the migrations.

To run the app against the local stack, put the local API URL and publishable key from `bunx supabase@2.120.0 status` in `apps/mobile/.env.local`. It overrides `apps/mobile/.env`.

To use Sign in with Apple in the iOS simulator, sign in with an Apple ID in the simulator's Settings app first. The build signs with the team in `ios.appleTeamId`, because the Sign in with Apple capability needs a signed app.

### Development build on an iPhone

EAS Build makes the development build for a physical iPhone and shares it through internal distribution. Only iPhones registered with the Apple Developer account can install it.

`apps/mobile/eas.json` has three build profiles. Each profile uses the EAS environment with the same name. That environment holds the Supabase URL, the publishable key, and the Google client IDs.

| Profile | EAS environment | Build |
| --- | --- | --- |
| `development` | development | Development build with the developer tools, for registered iPhones |
| `preview` | preview | The app with its JavaScript bundled, for registered iPhones |
| `production` | production | The app for the App Store |

Run the commands from `apps/mobile`. Run the EAS CLI as `npx eas-cli@latest`, which must be 24.4.2 or later. Log in to the `reilley` Expo account with `npx eas-cli@latest login`. Older versions fail to log in to Apple with "iTunes service key is empty".

1. Register the iPhone with `npx eas-cli@latest device:create`. Sign in to the Apple Developer account, choose the website option, and open the URL or QR code on the iPhone. Install the profile that it downloads in the Settings app.
2. Build with `npx eas-cli@latest build --profile development --platform ios`. The first build asks for the Apple Developer login. Let EAS create and manage the distribution certificate and the provisioning profile. Later builds reuse them. After you register another iPhone, build again and let EAS add the iPhone to the provisioning profile.
3. Open the build link or scan the QR code from the build output with the iPhone, and tap **Install**. If iOS asks for Developer Mode, turn it on in Settings > Privacy & Security > Developer Mode, and restart the iPhone.
4. Start Metro with `bunx expo start --dev-client`. The Mac and the iPhone must be on the same network. Open mtgscan on the iPhone and choose the server, or scan the QR code in the terminal with the Camera app.

A preview or production build bundles its JavaScript with the values from its EAS environment. A development build gets its JavaScript from Metro, which reads `apps/mobile/.env`. Only the Google iOS URL scheme in the development build comes from the EAS development environment. Keep `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` the same in both places, or Google sign-in fails. Delete `apps/mobile/.env.local` to use the hosted Supabase project.

### Versions

The app version in `apps/mobile/app.json` follows the release version. Release-please updates it together with the root `package.json`. EAS keeps the iOS build number (`cli.appVersionSource` is `remote`) and increments it for each production build.

The app stays on Expo SDK 56. SDK 57 does not build on Xcode 26.3, because `expo-modules-jsi` 57.0.5 and later fail to compile with Swift 6.2 ([expo/expo#50067](https://github.com/expo/expo/issues/50067)). Move to SDK 57 when Expo releases the fix for it.

### Catalog search

Signed-in users search the card catalog with `supabase.rpc('search_catalog', { query })`. The query is a typed object, never a query string. `supabase/search.ts` has the shared types for the query, the result page, and errors.

- A text search ranks an exact full card name first. Next come exact face names, then other name matches, Oracle tag matches, type line matches, and Oracle text matches.
- A refused call returns an error with a `code` such as `invalid_argument` or `invalid_cursor`. The field at fault is in `details`. `readSearchError` reads it as a `SearchError`.
- `get_cards` reads card details for up to 20 cards. Each card lists its direct Oracle tags that are not disabled, as `slug` and `label`, sorted by label. Each card also lists up to 5 combos as `combos`. Each combo has its `spellbook_id`, the `other_card` with its Oracle ID and name, its produced features, and its bracket tag. Combos sort by the other card's EDHREC rank, with missing ranks last, then by the other card's name, then by Spellbook ID. A card with no combos has an empty list.
- Each first page writes one row to `search_telemetry`. It is the one table with user data that has no read policy: app users cannot read it, and only the secret key can.
- Catalog search also accepts the secret key, for the search release check. Its telemetry row has the caller `release_check` and no user. It counts no owned copies. No other search or catalog read accepts the secret key.

### Scan batch commit

Signed-in users add a scan batch to the collection with `supabase.rpc('add_scan_batch', { batch })`. It runs in one transaction. `supabase/collection.ts` has the shared types for the batch, the result, and errors.

- The batch has an `idempotency_key` UUID and 1 to 2,000 stacks. Each stack has `card_printing_id`, `finish`, `condition`, `language`, and `quantity` from 1 to 999.
- Stacks with the same card printing, finish, condition, and language are summed. Each stack merges into the caller's collection entry with the same properties, no protected flag, and no user tags. If there is no such entry, the commit creates it.
- Each commit writes one addition and one addition line per stack. The line records the purchase-day price in USD and EUR cents for the card printing and finish, with the price snapshot time. A missing price is null.
- A repeated idempotency key with the same stacks returns the first result with `replayed` true and changes nothing. With different stacks it fails with `idempotency_conflict`.
- A refused call writes nothing. Its error has a `code` of `invalid_argument`, `unknown_printing`, `basic_land`, or `idempotency_conflict`, and the field at fault in `details`, such as `items[3].finish`. `readScanBatchError` reads it.

### Binder grid read

Signed-in users read their collection as card printings with `supabase.rpc('list_collection_printings', { query })`. The query has an optional `limit` from 1 to 120, which defaults to 60, and an optional `cursor`. `supabase/collection.ts` has the shared types for the query and the page.

- Each row is one card printing that the user owns: `printing_id`, `name`, `set`, `collector_number`, `image_uris`, `owned_quantity`, and `latest_addition_at`.
- The owned quantity sums every collection entry of the card printing, across finish, condition, language, protected flag, and user tags.
- Rows sort by the latest addition time, newest first, then by name, then by card printing ID.
- `next_cursor` reads the next page. A cursor works only for the user who got it, for 15 minutes. A refused call has the code `invalid_argument` or `invalid_cursor` and the field at fault in `details`, as in catalog search.
- The function runs with the caller's rights, so the read policy on `collection_entries` returns only the caller's collection entries. An anonymous caller and the secret key are refused.

### Collection search

Signed-in users search their own collection entries with `supabase.rpc('search_collection', { query })`. It takes the same typed query as catalog search, plus the collection chips. `supabase/collection.ts` has the shared types for the query and the result rows.

- An empty query returns every collection entry from A to Z. Collection search also returns cards that are not Commander-legal, and collection entries whose card printing is marked absent.
- `finishes`, `conditions`, and `languages` match the collection entry. They take the finish, condition, and language values of collection entries.
- `sets` and `rarities` match the entry's own card printing. `price_min`, `price_max`, and `sort: 'price'` use the current price of that card printing and finish. `sort: 'release_date'` uses the release date of that card printing.
- `is_free` matches entries with at least one free copy. A protected copy can be free. `is_protected` matches the protected flag. The Collection tab's Free filter is `is_free: true` with `is_protected: false`.
- `deck_ids` and `deck_ids_exclude` take deck IDs. Until decks exist, every deck ID is refused with `invalid_argument` on its field.
- Each row has the collection entry's quantity, free quantity, allocated quantity, and held quantity, from the collection availability view. The view has one row for each collection entry of the caller. Allocated and held quantities are zero until decks and planned swaps exist.
- Collection search runs with the caller's rights, like catalog search. The view sets `security_invoker`, so the read policy on `collection_entries` keeps only the caller's rows.
- Catalog search, `get_cards`, and `list_card_printings` read owned quantities from the same view. A printing list keeps an absent card printing when the caller owns it.
- Each first page writes one row to `search_telemetry` with the API `collection`. The secret key cannot call collection search.

### Search release check

`bun run release-check` in `supabase` runs every search in the graded search corpus through catalog search with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It reports whether search is ready to release. It exits with a failure unless every exact-name search ranks its card first, classes 2 to 4 each reach a capped recall@20 of 0.7 or more, and no returned card fails a chip in its query. The Release check workflow runs it by hand against the hosted project. It never runs on pull requests or on a schedule. `supabase/release-check/README.md` describes the corpus, the grading rule, and the report.

### Card catalog imports

`bun run import <command>` in `supabase` runs an import with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Pass `--manifest <path>` to read a fixture instead of the Scryfall bulk data manifest. Pass `--variants <path>` to read a fixture instead of the Commander Spellbook variants file.

- `catalog` imports cards and card printings. The Weekly import workflow runs it.
- `oracle_tags` imports Oracle tags, tag edges, and card taggings from Scryfall. The Weekly import workflow runs it after `catalog`, even when the catalog run fails.
- `commander_spellbook` imports combos, as `GLOSSARY.md` defines them, from the Commander Spellbook variants file. It drops and counts each combo that names a card outside the card catalog or has no Oracle ID. The Weekly import workflow runs it after `oracle_tags`, even when an earlier run fails.
- `prices` imports current prices from Scryfall Default Cards and recomputes each card's lowest current price.
- `prune-telemetry` deletes search telemetry older than 180 days.
- `retry-weekly` runs again each weekly source whose latest run failed.

`bun run oracle-tag disable <tag UUID>` stops a bad Oracle tag from matching any search. `bun run oracle-tag enable <tag UUID>` undoes it. The Oracle tag workflow runs the same command by hand. A disabled tag stays disabled after every later tag import.

The Daily import workflow runs `prices`, `prune-telemetry`, and `retry-weekly`. Each run records an import run, so the hosted project does not pause. The Import workflow runs one source by hand.

### Per-user data

Every table that holds a user's data follows one pattern:

- Row-level security is on, and the read policy returns only the signed-in user's rows.
- Direct inserts, updates, and deletes are revoked for the `anon` and `authenticated` roles.
- Changes go only through database functions. Each function runs in one transaction and checks the caller's identity.
- Reads run with the caller's rights, so the read policy decides which rows the caller sees. Read functions are `security invoker`, and views over a user's data set `security_invoker`. No read function filters on the caller itself.

The tables with a user's data are `profiles`, `collection_entries`, `collection_additions`, and `collection_addition_lines`. `search_telemetry` departs from the pattern, as Catalog search says. App roles cannot write `search_telemetry`. Searches write their telemetry row through `private.record_search`. It runs with the owner's rights.

The `anon` role cannot use the `private` schema. `authenticated` and `service_role` can use it. Every `private` function is closed by default. A migration grants `execute` on a helper only to the roles whose functions call it.

Signing up creates the user's profile through a trigger on `auth.users`.
