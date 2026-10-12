# mtgscan

An iPhone app for scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. The first release is iOS only. Android comes later. An authenticated remote MCP service lets compatible AI chats search the card catalog and collection, inspect decks, and make deck suggestions.

## Development

The repo is a Bun workspace. The Expo app lives in `apps/mobile`. The public website, with the homepage and privacy policy, is static HTML in `apps/site`.

1. Install dependencies with `bun install`.
2. Build and open the development build in the iOS simulator with `bun run --filter @mtgscan/mobile ios`.

Public build-time settings go in `apps/mobile/.env`. `apps/mobile/.env.example` lists their names. Never put a service role key in the app.

Checks run on every pull request. Run them locally with `bun run typecheck`, `bun run lint`, and `bun run test`.

### Card recognizer

The card recognizer is a local Expo module in `apps/mobile/modules/card-recognizer`. `recognize(photoUri, outline)` returns a card result with its candidates and decision, or a not-a-card result, as #75 describes. The outline is the four card corners, top left first and clockwise, as fractions of the photo's width and height from its top-left corner. It loads the gallery from `Application Support/gallery` on the phone and throws `gallery_not_ready` until one is there.

Each candidate carries its card printing ID, Oracle ID, name, set code, collector number, finishes, and basic land flag from the printing list. Name search also runs on the phone, over the printing list of the installed gallery:

- `searchCardNames(text)` matches card names and face names. It ignores case, accents, and punctuation. It returns up to 10 cards: exact names first, then names that start with the text, then names with a word that starts with it. There is no fuzzy match.
- `cardPrintings(oracleId)` returns every card printing of that card in the gallery, newest first.

### Gallery download

The app keeps the gallery on the phone up to date. The code is in `apps/mobile/src/gallery` and in the recognizer module.

1. On each app start with a session, it reads `published.json` from the `gallery` bucket with the user's session. When the published gallery version is the installed one, it does nothing.
2. Otherwise it reads the manifest, signs a URL for every part for 7 days, and passes them to `downloadGallery` in the recognizer module.
3. The module downloads the parts with a background URL session, so the download goes on while the app is suspended. It downloads only the parts that the installed gallery does not have, so an add-on costs only its own parts.
4. It checks the size and SHA-256 of each part against the manifest. A part that fails is deleted and downloaded again, up to 3 times. Verified parts stay in `Application Support/gallery-download` until the install, so an interrupted download goes on from the parts it has. A part that stopped partway resumes from where it stopped when iOS can.
5. When every part is there, the module decodes the int8 rows to unit-length float16 in a new folder, applies the add-on rows over the installed gallery, and swaps the folder into `Application Support/gallery` in one step. The recognizer loads the new gallery on the next scan. Both folders are excluded from backup.

The download uses Wi-Fi only. **Download now** on the Scan tab allows mobile data for the download in progress. Before it starts, the module checks the free space for the parts and the installed gallery. The module reports each change as an `onGalleryDownload` event, and the Scan tab and the settings sheet show it.

A gallery version that is not published cannot be read with a user's session. To install one on a development build, for the parity check in #84, put signed URLs from the `sign` command in `apps/mobile/.env.development.local`. Only development builds read `EXPO_PUBLIC_DEVELOPMENT_GALLERY`, and Metro must start again after you change it:

```bash
cd supabase
echo "EXPO_PUBLIC_DEVELOPMENT_GALLERY='$(bun --env-file=.env.hosted gallery/main.ts sign <version> | jq -c .)'" > ../apps/mobile/.env.development.local
```

The Swift sources in `ios/Recognizer` build into the app and into a macOS command through `Package.swift`. The macOS command computes gallery feature prints and runs the scanner evidence gates. Run the gates on a Mac from `apps/mobile`:

1. `bun run recognizer:test` runs the Swift fixture tests.
2. `bun run recognizer:replay` replays the scanner evidence pack. It needs the gallery.

`apps/mobile/test/scanner-evidence/README.md` describes the gallery, the gates, and the local replay before merge.

### Gallery build and publish

The owner builds the gallery on the Mac at each set release with `bun run gallery <command>` in `supabase`. #75 describes the format. The commands read `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. For the hosted project they live only in `supabase/.env.hosted`, which Git ignores and Bun does not load by itself. Run a command with them as `bun --env-file=.env.hosted gallery/main.ts <command>`. `docs/agents/local-development.md` (Gallery build) has the rules.

1. `build` reads Scryfall Default Cards and keeps the paper card printings that are in the card catalog. It downloads the missing `normal` images into `~/Library/Caches/mtgscan/scryfall-images`, 8 at a time. The macOS recognizer command computes the int8 feature prints, and the build reuses the ones it already has. It then writes the gallery parts, the printing list parts, and the manifest with the SHA-256 of each part, and uploads them as a new gallery version that is not published. It prints the sizes against the Free plan budget.
2. The owner runs the parity check on the iPhone (#84). Signed-in users cannot read a gallery version that is not published, so `sign <version> [--hours <n>]` prints signed URLs for its manifest and parts, valid for 24 hours by default, for a development build. Gallery download (above) says how a development build uses them. `parity <version> --lowest-cosine <n> --mean-cosine <n> --references <n>` records the result.
3. `publish <version>` refuses a gallery version without a passing parity check: a lowest cosine of at least 0.98 over 24 or more references. It then moves the pointer, `published.json`, to the version. It deletes every other gallery version except the previous one and the one that the scanner evidence pack names.

`status` lists the recorded gallery versions with their sizes, parity checks, and Storage use. `install <version>` unpacks a gallery version on the Mac into the folder that the scanner evidence replay reads.

A build is a new base when no gallery version is published, when the feature print revision, the encoding, or the macOS major version changed, when add-ons would pass 10% of the base rows, or with `--new-base`. Otherwise it is an add-on with the new card printings and the card printings whose image or printing list row changed. A phone then downloads only the add-on. A build with no change uploads nothing. An add-on cannot remove a row, so a card printing that the card catalog marks absent stays in the gallery until the next base. The build reports how many. A scan of it can still be committed, because the card catalog keeps absent card printings.

The gallery lives in the private `gallery` bucket. Signed-in users can read `published.json` and the published gallery versions. Anonymous callers cannot read the bucket, and no app role can write it. `gallery_versions` records each gallery version with its manifest, parity check, and publish time. Only the secret key can read it, and it changes only through the gallery functions.

### Card detector

The card detector is a local Expo module in `apps/mobile/modules/card-detector`. Its camera view owns the iOS capture session: the back camera, the preview, frame analysis, and the photo output. The app does not use VisionCamera.

- About 5 times a second, the detector finds a card in a preview frame with the Apple Vision document proposal and the luma edge refiner from #10. It sends one detection sample to JavaScript for each analyzed frame.
- A card is detected when its refined outline passes every detector gate: proposal confidence at least 0.5, area 0.08 to 0.9 of the frame, aspect within 0.02 of 63:88, and edge support at least 0.7. The view draws the magenta outline only around a detected card, without waiting for JavaScript.
- A sample has `detected`, the refined `corners`, the proposal, its `confidence`, `areaRatio`, `aspectRatio`, `edgeSupportMin`, the 8 x 6 brightness `signature`, the frame size, `nativeDurationMs`, `sampledAtMs`, and `runtimeErrorCode` or null. Corners are fractions of the upright frame, top left first and clockwise.
- `takePhoto(outline)` takes the outline of the sample that held still and returns it with the photo file, in the same fractions of the photo as `recognize` takes. The photo has the same aspect as the analyzed frame.
- Taking a photo plays no haptic. On iOS 18 and later, the shutter sound is suppressed where iOS allows it. On iOS 17, and where the law requires the shutter sound, iOS still plays it.

The capture rule from #75 lives in `apps/mobile/src/scan/capture.ts`. It takes one photo when a detected card holds still for 400 ms, and re-arms after the card leaves or changes. The app needs iOS 17, because the recognizer uses Vision feature print revision 2.

`bun run detector:test` in `apps/mobile` runs the Swift fixture tests for the detector on a Mac. Development builds log each capture event to Metro as a `CAPTURE` line, with the detector timing every 300 samples.

### Scan feedback

`apps/mobile/src/scan/scan-sounds.ts` plays the two scan sounds with `expo-audio`. `playScanSound('recognized')` plays a soft two-note blip of 0.18 s, and `playScanSound('failed')` plays a lower tone of 0.25 s. Both are quiet. `preloadScanSounds()` sets the audio mode and loads both players before the first scan. The audio mode is ambient (`playsInSilentMode: false`, `interruptionMode: 'mixWithOthers'`), so the sounds follow the Ring/Silent switch and mix with other audio. The sounds were synthesized for this app. `bun run scan-sounds` in `apps/mobile` writes them to `assets/sounds` again. `expo-haptics` plays the scan haptics. When the latest-scan chip shows a result, `src/scan/scan-feedback.ts` plays a heavy impact and the blip for a recognized card, and a warning haptic and the lower tone for a failed recognition. A photo that is not a card plays neither. The Scan sounds switch in settings turns the sounds off and keeps the haptics. The app keeps the switch in the keychain with `expo-secure-store`.

### Latest scan

`apps/mobile/src/scan/use-scan-recognition.ts` sends each photo to `recognize`, deletes the photo when the recognizer answers, and reports the result to the scan batch in `src/scan/scan-batch-state.tsx`. `src/scan/scan-batch.ts` holds the scans with their copies, the default finish rule from #75, and the edits from the details sheet. The batch stays in memory until #83 adds persistence, review, and commit. Card images on the chip and in the details sheet come from `image_uris` in the card catalog's `card_printings` table, and `expo-image` keeps them in its disk cache.

### Local Supabase

The Supabase project lives in `supabase`: configuration, SQL migrations, generated types, and database tests. The local stack needs Docker and the Supabase CLI 2.120.0.

1. Copy `supabase/.env.example` to `supabase/.env` and fill in the Google client IDs, web ID first, then iOS ID, separated by a comma. Native Google sign-in does not use the secret. The Apple provider needs no setting. Its client ID is the bundle ID, `dev.reilley.mtgscan`. Native Sign in with Apple does not use a secret.
2. Start the stack from the repo root with `bunx supabase@2.120.0 start`. Stop it with `bunx supabase@2.120.0 stop`.
3. Run the database tests with `bun run test:database`.
4. After you change a migration, run `bunx supabase@2.120.0 db reset` and then `bun run types:database`. CI fails when `supabase/database.types.ts` does not match the migrations.

To run the app against the local stack, put the local API URL and publishable key from `bunx supabase@2.120.0 status` in `apps/mobile/.env.local`. It overrides `apps/mobile/.env`.

A development build against the local stack can sign in a local test user with one tap. Set `EXPO_PUBLIC_TEST_SIGN_IN=true` in `apps/mobile/.env.local`, and seed the test user with `bun run test-user` in `supabase`. The command and the app refuse any Supabase URL other than the local stack, and production builds leave the test sign-in out. `docs/agents/local-development.md` (Test sign-in) has the steps.

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
