# mtgscan

An iPhone app for scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. The first release is iOS only. Android comes later. An authenticated remote MCP service lets compatible AI chats search the card catalog and collection, inspect decks, and make deck suggestions.

## Development

The repo is a Bun workspace. The Expo app lives in `apps/mobile`. The public website, with the homepage and privacy policy, is static HTML in `apps/site`.

1. Install dependencies with `bun install`.
2. Build and open the development build in the iOS simulator with `bun run --filter @mtgscan/mobile ios`.

Public build-time settings go in `apps/mobile/.env`. `apps/mobile/.env.example` lists their names. Never put a service role key in the app.

Checks run on every pull request. Run them locally with `bun run typecheck`, `bun run lint`, and `bun run test`.

### Styling

The app uses NativeWind 4 with Tailwind CSS 3. NativeWind 5 is a release candidate. See #102.

- `src/theme.ts` holds the `DESIGN.md` tokens. `src/tailwind-theme.ts` builds the Tailwind theme from it, and `tailwind.config.js` uses that theme. Restart Metro after a change to either file.
- `cn()` in `src/lib/class-names.ts` merges class names and knows the token names.
- Jest compiles the classes in `test/class-styles.ts` before each test, so component tests can check class styles with `toHaveStyle`.
- NativeWind needs `react-native-reanimated` and `react-native-worklets`. They are native modules, so a change to them needs a new native build. CocoaPods builds them from source, which adds time to each clean build.

### Card symbols

The app draws card symbols with the Mana font by Andrew Gioia (https://github.com/andrewgioia/mana), version 1.18.0.

- The font file is `assets/fonts/mana.ttf`. Its license is the SIL Open Font License 1.1, and `assets/fonts/OFL.txt` holds it. The license lets the app bundle and ship the font. The Mana CSS is MIT licensed, and the app does not use it. The symbol images are copyright Wizards of the Coast.
- The `expo-font` config plugin in `app.json` embeds the font in the native build. The app never downloads it. A change to the font file needs a new native build. The font file names its license, SIL OFL 1.1, and the license link in its metadata, as the license allows for a font inside an app.
- `src/lib/card-symbols.ts` maps each symbol that Scryfall's symbology lists to its glyphs, its circle colors, and the words VoiceOver reads.

### Components

Components follow Atomic Design in `src/components`. `CODING_STANDARDS.md` (Atomic Design) has the levels and the rules.

- `atoms` holds the primitives: `Text`, `TextLink`, `Button`, `Chip`, `Toggle`, `Switch`, `Surface`, `GlassSurface`, `GlassGroup`, `CardImage`, `CardThumbnail`, `TileButton`, `AppleSignInButton`, `Input`, `ProgressBar`, `Skeleton`, `SetIcon`, `DimSymbol`, `QuickActionButton`, `CountBadge`, `FloatingMenuButton`, `NameAlert`, `CardContextMenu`, and `ManaSymbol`. `Button` has a 50 px sign-in size and the Google variant. `AppleSignInButton` wraps the system Apple button. `Toggle` wraps `@rn-primitives/toggle`. `Switch` wraps the iOS switch. `NameAlert` is a native SwiftUI alert from `@expo/ui` with a name field, Cancel, and a confirm button that is off while the trimmed name is empty. `FloatingMenuButton` is a round 48 px button on a `GlassSurface` that opens a native SwiftUI menu from `@expo/ui`, with a title and choices that can have a check mark and a symbol. `CardContextMenu` wraps a card in a native SwiftUI context menu from `@expo/ui` that opens on a long press, with the card as its preview. `GlassSurface` and `GlassGroup` wrap `GlassView` and `GlassContainer` from `expo-glass-effect`, and fall back to plain views when `isLiquidGlassAvailable()` is false. Inside a `GlassSurface`, `Text`, `QuickActionButton`, `Skeleton`, `CardThumbnail`, and `DimSymbol` take the glass colors.
- `molecules` holds `ChipGroup`, `ToggleGroup` (a segmented control on `@rn-primitives/toggle-group`), `ListRow`, `SwitchRow`, `EmptyState`, `CardTile`, `CardGrid`, `AccountCard`, `GalleryCard`, `FailureNotice`, `Brand`, `QuickActionBar`, `SheetSection`, `BatchButton`, `CopyMeta`, `PriceLine`, `SwipeToConfirm`, `ThumbnailChip`, `SymbolText`, `CommanderCard`, `CommanderGalleryCard`, `SortButton`, `GroupButton`, `Stepper`, `StepperRow`, and `SaveBar`. `CardTile` is a card image with its set and collector number, 3 to a row, with an optional long-press menu. The binder grid and the card printing grids on the Scan tab use it. A `CardTile` can show a ×N count badge on the image, as the basic land tiles of a deck do. `Stepper` is a minus button, a count, and a plus button. `StepperRow` is a row with a card thumbnail, a name, and a `Stepper`, as in the basic lands drawer. `SaveBar` holds **Cancel** and **Save N changes**. `SymbolText` shows text with its card symbols, such as {G} or {T}, drawn with the Mana font. `CommanderCard` is the 140 px deck card of the Decks gallery, with the first commander's art and the second commander's avatar, and `CommanderGalleryCard` is its gallery button. `DeckBanner` is the deck screen banner with the same art and avatar. It runs edge to edge from the top of the screen and is 200 px tall below the safe area. The ghost commander card of the Decks empty state uses the same frame. `SortButton` is the round sort button that Collection and the deck screen's Cards tab share. It is a `FloatingMenuButton` with a "Sort by" menu and an arrow for the direction of the current sort. `GroupButton` is the round group button of the Cards tab, a `FloatingMenuButton` with a "Group by" menu. `ThumbnailChip` is a chip on a `GlassSurface` with three columns: a thumbnail, a flexible middle, and an optional accessory. The side columns have the same fixed width, so the middle is centered. A chip with an action is a button on glass that reacts to touch. The latest-scan chip uses it. `ChangeLine` is a green + or red − row of a deck change, with a thumbnail, the card name, and a meta line.
- `organisms` holds `BinderWall`, `SignInSheet`, `SettingsContent`, `collectionTotalMenu` (the collection total menu item for the tab header), `collectionFiltersButton` (the Filters bar button on Collection), `CollectionFilters` (the chips of the Filters drawer), `DeckCards` and `DeckCardOrderButtons` (the Cards tab of the deck screen and its group and sort buttons), `DeckHistory` (the History tab), `batchReviewMenu` (the ••• menu in the batch review bar), and the Scan tab sections: `LatestScanControls`, `LatestScanChip`, `ScanQuickActions`, `ScanDetails`, `ScanDetailsContent`, `NameSearch`, `PrintingPicker`, and `ScanBatchList`. `templates` holds `TabStack`, `TabScreen`, `TabListScreen`, `PushedScreen`, `FloatingButtons`, `DrawerSheet`, and `ChoiceSheet`. `TabStack` is the native stack of Recent, Collection, and Decks, with the large title header. The Collection stack also presents the Filters drawer. `CollectionSearchProvider` wraps that stack and holds the search text and chips, so the tab and the drawer share them. `TabScreen` and `TabListScreen` set the tab header title, put optional header actions and the settings button in the native bar, and scroll the content under it. `TabListScreen` and `PushedScreen` can float buttons in a `FloatingButtons` row at the bottom right, 8 px apart. They sit 16 px above the tab bar on a tab, and 16 px above the bottom safe area on a pushed screen. `DrawerSheet` is the content layout of the bottom drawers, with an optional footer below the content that scrolls, such as the `SaveBar` of the basic lands drawer. Its module also holds the screen options for half-height and full-height drawers, for a drawer screen with a title bar, and for a screen pushed inside a drawer. `ChoiceSheet` is a short drawer with one chip for each value, used by the condition and language pickers. Batch review is a stack inside its drawer: the list, and the scan details pushed over it. `ScanDetails` is the scan details content for both the scan details drawer and batch review.
- Expo Router routes in `src/app` are the pages.
- ESLint checks the import direction between the levels with `eslint-plugin-boundaries`. It also keeps raw controls out of screens and features. See `apps/mobile/eslint.config.js`.
- `LatestScanControls` puts the latest-scan chip and the quick-action bar in one `GlassGroup`.
- Only `Skeleton` animates. It pulses with React Native `Animated`, not Reanimated, so no test needs Reanimated animations.

A development build has a primitive catalog that shows every primitive in each state. Open it on the Simulator with `xcrun simctl openurl booted mtgscan://primitives`. Production builds leave it out, and `bun run test:production-bundle` checks that.

### Card recognizer

The card recognizer is a local Expo module in `apps/mobile/modules/card-recognizer`. `recognize(photoUri, outline)` returns a card result with its candidates and decision, or a not-a-card result, as #75 describes. The outline is the four card corners, top left first and clockwise, as fractions of the photo's width and height from its top-left corner. It loads the gallery from `Application Support/gallery` on the phone and throws `gallery_not_ready` until one is there.

Each candidate carries its card printing ID, Oracle ID, name, set code, collector number, finishes, and basic land flag from the printing list. Name search also runs on the phone, over the printing list of the installed gallery:

- `searchCardNames(text)` matches card names and face names. It ignores case, accents, and punctuation. It returns up to 10 cards: exact names first, then names that start with the text, then names with a word that starts with it. There is no fuzzy match.
- `cardPrintings(oracleId)` returns every card printing of that card in the gallery, newest first.

`checkGalleryParity()` runs the parity check on the installed gallery. It takes 24 evenly spaced gallery rows and downloads the Scryfall `normal` image of each from the Scryfall image host. It computes their feature prints on the phone in the same way as the macOS command, and compares each with its gallery row. It returns the gallery version, the number of reference images it checked, the lowest and mean cosine, and each reference image that failed. Only development builds show **Run the parity check** in settings. The result shows under it, and Metro gets the same numbers as a `PARITY` line.

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
2. The owner runs the parity check on the iPhone (#84). In a development build, **Run the parity check** in settings runs it on the installed gallery version. Signed-in users cannot read a gallery version that is not published, so `sign <version> [--hours <n>]` prints signed URLs for its manifest and parts, valid for 24 hours by default, for a development build. Gallery download (above) says how a development build uses them. `parity <version> --lowest-cosine <n> --mean-cosine <n> --references <n>` records the result.
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

### Keep awake

`apps/mobile/src/scan/keep-awake-while-scanning.tsx` keeps the screen on with `expo-keep-awake` while the app is in the foreground on the Scan tab or on a screen opened from it: batch review, the scan details, and the printing, condition, and language pickers. `scanRoutes` lists their routes. Every other screen and the background follow the phone's auto-lock. `expo-keep-awake` is a dependency of `expo`, so it was already linked, and it needs no new native build. Development builds keep the screen on everywhere, because Expo does that in development. Check the auto-lock on a release build.

### Latest scan

`apps/mobile/src/scan/use-scan-recognition.ts` sends each photo to `recognize`, deletes the photo when the recognizer answers, and reports the result to the scan batch in `src/scan/scan-batch-state.tsx`. Development builds log each recognition to Metro as a `RECOGNITION` line: the recognition, the time, and the end-to-end time from the photo request. The bin-deck run reads these lines. `src/scan/scan-batch.ts` holds the scans, the default finish rule from #75, and the edits from the quick actions and the details sheet. Each scan is one copy. **+1** adds a new scan with the same card printing, finish, condition, and language. Card images on the chip and in the details sheet come from `image_uris` in the card catalog's `card_printings` table. The set button shows the expansion symbol from `icon_svg_uri` in `card_sets`. `expo-image` keeps both in its disk cache.

### Scan batch

The scan batch lives in `src/scan/scan-batch-state.tsx`, one per signed-in account.

- After every change, the phone writes the scan batch to `scan-batch-<user ID>.json` in the app's documents folder with `expo-file-system`. The file holds a format version, the scans, and the pending commit. `src/scan/scan-batch-file.ts` reads and writes it.
- When an account signs in, the phone reads its file back. Sign-out keeps the file and clears the scan batch from the screen.
- Each scan gets a UUID when it is made, including a scan from **+1**. It is the copy ID of that copy.
- **Add to collection** calls `add_scan_batch` with one stack per card printing, finish, condition, and language, and the copy IDs of its scans. The server adds each copy ID once, so a retry never adds a copy twice, even after the scan batch changed.
- The file marks a commit that has not finished. At sign-in, the phone sends that commit again by itself.
- A commit that works removes the scans it sent. A commit that fails keeps every scan. Batch review rows do not open while a commit runs.
- **Remove** in the **Remove all scans** alert of batch review empties the scan batch and its file. It also clears a commit that has not finished. A recognition that is still running adds no scan when it ends. Nothing reaches the server.
- Pulling down on the Scan tab adds the scan batch with the same commit as **Add to collection**. `src/scan/use-pull-to-add.ts` tracks the pull with React Native's `PanResponder`, so the app needs no gesture library.

### Local Supabase

The Supabase project lives in `supabase`: configuration, SQL migrations, generated types, and database tests. The local stack needs Docker and the Supabase CLI 2.120.0.

1. Copy `supabase/.env.example` to `supabase/.env` and fill in the Google client IDs, web ID first, then iOS ID, separated by a comma. Native Google sign-in does not use the secret. The Apple provider needs no setting. Its client ID is the bundle ID, `dev.reilley.mtgscan`. Native Sign in with Apple does not use a secret.
2. Start the stack from the repo root with `bunx supabase@2.120.0 start`. Stop it with `bunx supabase@2.120.0 stop`.
3. Run the database tests with `bun run test:database`.
4. After you change a migration, run `bunx supabase@2.120.0 db reset` and then `bun run types:database`. CI fails when `supabase/database.types.ts` does not match the migrations.

To run the app against the local stack, put the local API URL and publishable key from `bunx supabase@2.120.0 status` in `apps/mobile/.env.local`. It overrides `apps/mobile/.env`.

A development build against the local stack can sign in a local test user with one tap. Set `EXPO_PUBLIC_TEST_SIGN_IN=true` in `apps/mobile/.env.local`, and seed the test user with `bun run test-user` in `supabase`. The command and the app refuse any Supabase URL other than the local stack, and production builds leave the test sign-in out. `docs/agents/local-development.md` (Test sign-in) has the steps.

The before-user-created auth hook `public.limit_email_sign_ups` refuses every email sign-up except the test email. Apple and Google sign-up stay open. `supabase/config.toml` turns it on for the local stack. On hosted Supabase, the owner turns it on under Auth > Hooks.

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

### Test app on the iPhone

Agent builds on the owner's iPhone are a separate app, mtgscan Test, so the owner's mtgscan app holds only the owner's collection. `EXPO_PUBLIC_APP_VARIANT=test` makes it. `app.config.ts` then sets the name `mtgscan Test`, the bundle ID `dev.reilley.mtgscan.test`, and the URL scheme `mtgscan-test`, and refuses an EAS build. Babel inlines the variable, so other builds leave out the test app code.

- The test app uses hosted Supabase. It signs in the hosted test user, `test-user@mtgscan.test`, with one tap, and has no Apple or Google button.
- The hosted test user's password is random. It lives only in `~/.config/mtgscan/test-app.env`, as `EXPO_PUBLIC_TEST_USER_PASSWORD`.
- The owner seeds or resets the hosted test user with the sample collection and the sample deck from `supabase` in the main checkout: `bun --env-file=.env.hosted --env-file=$HOME/.config/mtgscan/test-app.env test-user/main.ts --hosted --sample-collection`. The command refuses a missing password and the local default password.
- `bun run ios:test-device --device <identifier>` in `apps/mobile` builds the test app in the Release configuration and installs it on the iPhone. It reads the password from `test-app.env` and never writes it to the worktree.
- `bun run test:production-bundle` checks that a production bundle has no test sign-in and that the test app bundle has one.

Agents build and install only the test app on the iPhone, and never sign in to the owner's mtgscan app. `docs/agents/local-development.md` (Test app on the iPhone) has the steps and the rules for agents.

### Versions

The app version in `apps/mobile/app.json` follows the release version. Release-please updates it together with the root `package.json`. EAS keeps the iOS build number (`cli.appVersionSource` is `remote`) and increments it for each production build.

The app stays on Expo SDK 56. SDK 57 does not build on Xcode 26.3, because `expo-modules-jsi` 57.0.5 and later fail to compile with Swift 6.2 ([expo/expo#50067](https://github.com/expo/expo/issues/50067)). Move to SDK 57 when Expo releases the fix for it.

### Catalog search

Signed-in users search the card catalog with `supabase.rpc('search_catalog', { query })`. The query is a typed object, never a query string. `supabase/search.ts` has the shared types for the query, the result page, and errors.

- A text search ranks an exact full card name first. Next come exact face names, then other name matches, Oracle tag matches, type line matches, and Oracle text matches.
- A refused call returns an error with a `code` such as `invalid_argument` or `invalid_cursor`. The field at fault is in `details`. `readSearchError` reads it as a `SearchError`.
- Prices are in USD. No price read takes `price_currency`. A query that sends it, even `USD`, is refused with `invalid_argument` on `price_currency`, so an old build fails loudly. The app converts prices itself, as Converted prices says, and the MCP service will too. Collection search, `get_cards`, the collection total, the current prices read, and the copy read take the same rule.
- Each row's `price_from` is the card's lowest current price in USD. A card with no lowest current price has no `price_from`.
- `price_min` and `price_max` are USD amounts. They compare with the lowest current price, and a bound matches a price equal to it. `sort: 'price'` uses the USD amount.
- `get_cards` takes `oracle_ids` or `printing_ids`. Its `price_from` is as in catalog search.
- `get_cards` reads card details for up to 20 cards. Each card lists its direct Oracle tags that are not disabled, as `slug` and `label`, sorted by label. Each card also lists up to 5 combos as `combos`. Each combo has its `spellbook_id`, the `other_card` with its Oracle ID and name, its produced features, and its bracket tag. Combos sort by the other card's EDHREC rank, with missing ranks last, then by the other card's name, then by Spellbook ID. A card with no combos has an empty list.
- Each first page writes one row to `search_telemetry`. It is the one table with user data that has no read policy: app users cannot read it, and only the secret key can.
- Catalog search also accepts the secret key, for the search release check. Its telemetry row has the caller `release_check` and no user. It counts no owned copies. No other search or catalog read accepts the secret key.

### Scan batch commit

Signed-in users add a scan batch to the collection with `supabase.rpc('add_scan_batch', { batch })`. It runs in one transaction. `supabase/collection.ts` has the shared types for the batch, the result, and errors.

- The batch has 1 to 2,000 stacks and at most 10,000 copy IDs. Each stack has `card_printing_id`, `finish`, `condition`, `language`, and `copy_ids`, a list of 1 to 999 copy IDs. A copy ID is a UUID that the phone gives each copy. It can appear only once in a batch.
- Stacks with the same card printing, finish, condition, and language are summed.
- Each new copy ID becomes a copy in `copies`, with its card printing, finish, condition, language, and addition line. A scanned copy is not protected. Copies are never merged or split.
- Each commit writes one addition and one addition line per stack. The line records the purchase-day price in USD cents for the card printing and finish, with the price snapshot time. A missing price is null.
- `collection_addition_copies` records each added copy ID with its addition line, once per user. A deleted copy's ID stays there. The function skips copy IDs that the caller already added, even when the stack around them changed or the copy was deleted. If every copy ID was added before, it changes nothing.
- The result has the new addition (`addition_id`, `added_at`, `copy_count`, and `items`, or nulls and 0 when nothing was new) and one row in `copies` per copy ID: its `copy_id`, the addition it went into, and `replayed` true when an earlier call added it.
- A refused call writes nothing. Its error has a `code` of `invalid_argument`, `unknown_printing`, or `basic_land`, and the field at fault in `details`, such as `items[3].finish`. `readScanBatchError` reads it.

### Converted prices

mtgscan stores every price in USD, and every read returns USD. The app converts prices into the price currency with the shared module `supabase/converted-prices.ts` (`@mtgscan/supabase/converted-prices`). The MCP service will use the same module. `docs/adr/0005-convert-all-prices-from-usd.md` says why.

- A converted price is the USD amount times the latest exchange rate, rounded half up to the currency's minor unit. JPY, KRW, ISK, and other currencies with no minor unit round to whole units. The module computes with exact decimals, not floating point.
- A converted price has `approximate: true`, `exchange_rate`, the rate from USD as a decimal string, and `rate_date`, the ECB date of the rate. A USD price has none of these three fields.
- An exchange rate is stale when its date is more than 4 days before today in UTC. The ECB publishes rates on working days only, so Friday's rate on a weekend is not stale. A converted current price is stale when its USD price is stale or its exchange rate is stale.
- The collection total converts the USD total once. It does not add up converted copy prices, so the total can differ by a few cents from the sum of the copy prices.
- A card printing and finish with no USD price has no price in any currency.
- `usdPriceBounds` turns a price filter in another currency into USD bounds for `price_min` and `price_max`. A bound matches every USD price whose converted price shows inside it, so each bound widens by half a minor unit before it converts, and rounds to whole cents. A range that no USD price can show inside sends a USD range above every stored price, so the search matches nothing. A bound converts to at most 9999999999.99 USD.

Signed-in users read the exchange rates with `supabase.rpc('list_exchange_rates')`. The result has `items`: USD and every currency in `exchange_rates`, in code order. Each item has `currency`, `rate` as a decimal string, `rate_date`, and `minor_unit_digits`, the decimals that a converted price in that currency has. USD has the rate `1` and no `rate_date`. The function runs with the caller's rights. An anonymous caller and the secret key are refused.

The app keeps the chosen currency on the phone, in the keychain with `expo-secure-store`. On first launch, it is the phone's region currency from `expo-localization` when it has an exchange rate, otherwise USD. `expo-localization` is a native module, so a change to it needs a new native build. When the chosen currency no longer has an exchange rate, the app shows prices in USD. The app reads the exchange rates once for each app session, and again when it returns to the foreground more than a day after the last read. It keeps them in memory. Price reads send no currency, so a change of currency converts the prices on the screen again and reads nothing. A price filter steps by one minor unit of the currency, so `price<500` in JPY is `price<=499` in yen before it converts to USD.

The app writes an amount with the currency's narrow symbol from `apps/mobile/src/collection/price-currency-labels.ts`, such as "$2.67" for AUD or "¥53" for JPY, with no country letters. Hermes on iOS treats `currencyDisplay: 'narrowSymbol'` like `'symbol'` and writes "A$2.67", so the app does not use it. A symbol that ends in a letter, such as "kr", has a no-break space before the number. A currency missing from the table shows with the `Intl` currency symbol. A converted price shows no "≈". The price credit says that prices are converted, and VoiceOver hears "about" before a converted price.

### Collection total

Signed-in users read their collection total with `supabase.rpc('get_collection_total', { query })`. The query is an empty object. `supabase/collection.ts` has the shared types.

- `total` is the sum of the current price of every copy for its card printing and finish, in USD, as a decimal string. `currency` is `USD`. Copies with no current price are left out.
- The app converts the USD total once, as Converted prices says.
- `priced_copies` counts the copies with a current price, and `copies` counts every copy, so a missing price never silently lowers the total.
- `stale` is true when the current prices are more than 24 hours old, as `catalog_freshness` says. The app also marks a converted total stale when its exchange rate is stale.
- `prices_observed_at` is the time of the price snapshot, or null before the first price import.
- The function runs with the caller's rights. An anonymous caller and the secret key are refused. A refused query has the code `invalid_argument` and the field at fault.

mtgscan stores no daily collection totals and no change since yesterday. `docs/adr/0004-keep-only-current-prices.md` says why.

### Current prices read

Signed-in users read the current prices of card printings and finishes with `supabase.rpc('get_current_prices', { query })`. The phone reads the prices of its scans through it. `supabase/collection.ts` has the shared types.

- The query has `items`, a list of 1 to 100 objects, each with `printing_id` and `finish`. An item can appear only once.
- The result has `items` in the same order. Each item has `printing_id`, `finish`, and `price`.
- `price` is the current price, as in a copy row of collection search, with `stale`.
- `price` is null when the card printing and finish has no current price. A card printing that is not in the card catalog has a null price too.
- The function reads only the card catalog and prices. It runs with the caller's rights. An anonymous caller and the secret key are refused. A refused query has the code `invalid_argument` and the field at fault, such as `items[3].finish`.

`apps/mobile/src/scan/current-prices.tsx` keeps the current USD prices of scans in memory for the app session, keyed by card printing and finish. They are not saved on the phone or in the scan batch file. A restart clears them. A change of currency converts them again and reads nothing.

- Batch review reads every key of the scan batch that the app does not know yet, in calls of at most 100 items. The latest-scan chip reads the key of the scan it shows. A change of finish or card printing makes a new key.
- The app reads each key once. A read that fails, for example offline, shows nothing. The key is read again the next time batch review opens or the chip shows a scan with that key.
- Prices never block scanning or the commit.

### Copy read

Signed-in users read one copy with `supabase.rpc('get_copy', { query })`. The query has only `copy_id`. `supabase/collection.ts` has the shared types. The copy page reads its copy through it.

- The result has the copy's `copy_id`, `finish`, `condition`, `language`, `protected`, and `free`, and its card printing as in a copy row of collection search: `printing_id`, `name`, `set`, `collector_number`, `rarity`, and `image_uris`.
- `art_crop_uri` is the art crop of the card printing, or null when Scryfall has none.
- `added_at` is the time of the copy's addition. `purchase_day_price` is the purchase-day price of its addition line in USD, with `amount`, `currency`, and `finish`, or null. The app converts it at the latest exchange rate, not the rate of the day of its addition.
- `price` is the current price, as in a copy row of collection search, with `stale`.
- From its card: `type_line`, `faces` with each face's `name` and `oracle_text` in face order, and `commander_legality`.
- `user_tags` lists the copy's user tags, each with `user_tag_id` and `name`, sorted by name ignoring case.
- `deck` is the deck the copy is in, with `deck_id`, `name`, the copy's `role` (`commander` or `main`), `commander_art_crop_uri`, the art crop of the deck's first commander or null, and `commander_count`, the number of commanders in the deck. It is null for a copy in no deck. `free` is false for a copy in a deck.
- The function runs with the caller's rights, so another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist. A refused query has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Protect a copy

Signed-in users protect or unprotect one of their copies with `supabase.rpc('set_copy_protected', { request })`. The request has `copy_id` and `protected`, `true` or `false`. `supabase/collection.ts` has the shared types. The copy page's actions menu calls it.

- It changes only that copy, in one transaction, and returns `copy_id` and `protected`. Doing what is already done changes nothing.
- Only a free copy can be protected. Protecting a copy that is not free, such as a copy in a deck, is refused with `copy_not_free` on `copy_id`.
- Another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Copy delete

Signed-in users delete one copy with `supabase.rpc('delete_copy', { request })`. The request has only `copy_id`. `supabase/collection.ts` has the shared type. The copy page deletes its copy through it.

- It deletes the copy in one transaction. The copy leaves collection search, `get_copy`, owned quantities, and the collection total and its coverage.
- A copy in a deck leaves its deck first, with one `removed_from_collection` deck change. It raises the deck revision by one and sets the last used time. Its line keeps the card printing and finish. History still shows the card. Deleting a copy in no deck makes no deck change.
- The copy's addition, its addition line, and its copy ID in `collection_addition_copies` stay. A replayed scan batch never adds the copy again.
- It returns nothing. Another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist or was already deleted. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### User tags

A user tag is a private label that a user puts on copies. `user_tags` holds each user tag with its user, its name, and its created time. The name is trimmed of white space at both ends and has 1 to 64 characters. A user's user tag names are unique ignoring case. `copy_user_tags` links copies to user tags, with the user ID. Deleting a copy or a user tag removes its links. `supabase/collection.ts` has the shared types.

- `supabase.rpc('create_user_tag', { request: { name } })` trims the name, creates the user tag, and returns its `user_tag_id` and `name`. A name that matches one of the user's user tags ignoring case is refused with `user_tag_exists` on `name`.
- `supabase.rpc('set_copy_user_tag', { request: { copy_id, user_tag_id, tagged } })` puts the user tag on the copy when `tagged` is true and takes it off when it is false. It returns nothing. Doing what is already done changes nothing. Putting a user tag on a copy or taking it off changes no collection entry.
- `supabase.rpc('rename_user_tag', { request: { user_tag_id, name } })` trims the name and renames the user tag. It keeps the ID, so every copy shows the new name. It returns `user_tag_id` and `name`. A name that matches another of the user's user tags ignoring case is refused with `user_tag_exists` on `name`.
- `supabase.rpc('delete_user_tag', { request: { user_tag_id } })` deletes the user tag and takes it off every copy. It returns nothing.
- `supabase.rpc('list_user_tags')` returns `items`: the caller's user tags with `user_tag_id`, `name`, and `copy_count`, sorted by name ignoring case. It runs with the caller's rights.
- The write functions check the caller's identity and run in one transaction each. Another user's copy or user tag is refused with `not_found` on `copy_id` or `user_tag_id`, like one that does not exist. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Decks

A deck is a Commander deck, as `GLOSSARY.md` defines it. `decks` holds each deck with its user, its name, its deck priority, its deck revision, its created time, and its last used time. `supabase/decks.ts` has the shared types.

- The name is trimmed of white space at both ends and has 1 to 64 characters. Two decks can have the same name.
- The deck priority is `high`, `medium`, or `low`. A new deck starts at `medium`.
- The deck revision starts at 0.
- `supabase.rpc('create_deck', { request: { name } })` trims the name and creates an empty deck with no commander. It returns `deck_id`. Creating a deck counts as using it.
- `supabase.rpc('mark_deck_used', { request: { deck_id } })` sets the deck's last used time. The deck screen calls it when it opens. It returns nothing.
- `supabase.rpc('list_decks')` returns `items`: the caller's decks with `deck_id`, `name`, `priority`, `card_count`, `commanders`, `last_used_at`, and `evaluation`. The deck used most recently comes first. Decks used at the same time sort by name ignoring case. `card_count` counts the deck's commanders, main deck, and basic lands. `commanders` lists each commander's `copy_id`, `name`, and `art_crop_uri`, the oldest commander first. `evaluation` is null for an empty deck. Otherwise it has the `validity` of the deck evaluation.
- `supabase.rpc('get_deck', { query: { deck_id } })` returns the fields of a `list_decks` item, plus `revision`, `created_at`, `cards`, and `basic_lands`. Reading a deck does not count as using it.
  - `evaluation` is null for an empty deck. Otherwise it has every stored field of the deck evaluation, as Deck evaluations says, and `validity_rules_data_at`, the snapshot time of the card catalog that the validity used.
  - `cards` lists every copy in the deck. Each has its card printing as in a copy row of collection search, its `finish`, `condition`, `language`, `protected`, and `price` with `stale`. It adds `role` (`commander` or `main`), `commander_at`, the time the card was made a commander or null, `added_at`, the time the copy went into the deck, and its card's `type_line`, `mana_value`, and `colors`. The app groups and sorts the cards.
  - `basic_lands` lists the twelve basic land cards in order: Plains, Island, Swamp, Mountain, Forest, Wastes, and the snow-covered version of each. Each has its card's `oracle_id`, its `name`, the `image_uris` of its basic land image, and its `count`, 0 when the deck has none. A basic land card that the card catalog does not have has a null `oracle_id` and no image.
  - The basic land image is the image of one card printing of that basic land, chosen the same way each time: a printing with an image first, then English, then one with a nonfoil finish, then the newest, then by set code and collector number. The lookup finds each basic land card through the `name_key` index, so it reads only those cards from the card catalog.
- `supabase.rpc('rename_deck', { request: { deck_id, name } })` trims the name and renames the deck. It returns nothing.
- `supabase.rpc('set_deck_priority', { request: { deck_id, priority } })` sets the deck priority. It returns nothing.
- Renaming a deck and setting its deck priority count as using it. Neither is a deck change, and neither raises the deck revision.
- `supabase.rpc('delete_deck', { request: { deck_id } })` deletes the deck, its deck cards, its basic lands, and its deck changes. Its copies become free. It returns nothing.
- `deck_cards` links copies to decks, with the user ID and the time the copy went into the deck. A copy is in at most one deck. `commander_at` is the time the card was made a commander, or null for the main deck. Deleting a deck or a copy removes its rows.
- `supabase.rpc('add_deck_card', { request: { deck_id, copy_id, unprotect } })` puts a free copy into the deck's main deck. It returns `deck_id` and the new `revision`.
  - A copy in a deck is refused with `copy_not_free` on `copy_id`. It locks the copy first, so two adds of one copy at the same time put it in one deck.
  - A protected copy is refused with `copy_protected` on `copy_id` unless `unprotect` is true. Then it unprotects the copy in the same transaction.
  - Another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist.
- `supabase.rpc('set_deck_commander', { request: { copy_id, commander } })` changes the place of a copy in a deck. It returns `deck_id` and the `revision`.
  - `commander: true` makes the card a commander. It is a `made_commander` deck change in a deck with no commander, and a `made_partner` deck change in a deck with one. Any card can be made a commander.
  - A deck has at most two commanders. A third is refused with `commander_limit` on `commander`.
  - `commander: false` moves a commander to the main deck with a `moved_to_main_deck` deck change.
  - A card that is already in the place asked for stays there. That makes no deck change.
  - A copy in no deck is refused with `copy_not_in_deck` on `copy_id`. Another user's copy is refused with `not_found` on `copy_id`.
- `supabase.rpc('remove_deck_card', { request: { copy_id } })` takes the copy out of its deck with a `removed` deck change. The copy becomes free. It returns `deck_id` and the new `revision`.
  - A copy in no deck is refused with `copy_not_in_deck` on `copy_id`. Another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist.
- Each change to a deck's cards is one deck change. It locks the deck, raises the deck revision by one, and sets the last used time. `deck_changes` holds each deck change with its deck, its user, the `revision` it made, its `kind`, its `changed_at` time, and `reverted_by`, the revert that undid it, or null. `deck_change_lines` holds one line per copy that the deck change moved: the copy ID, its card printing, its finish, and its place before and after, `commander`, `main`, or null for out of the deck. A line keeps the card printing and finish so that it can still show the card after the copy is deleted. Deleting a deck deletes its deck changes.
- `supabase.rpc('set_basic_lands', { request: { deck_id, counts } })` sets basic land counts. `counts` lists up to twelve items, each with a basic land card's `oracle_id` and its new `count`, 0 to 99. It returns `deck_id` and the `revision`.
  - Only the twelve basic land cards are accepted. Any other card, a repeated card, or a count outside 0 to 99 is refused with `invalid_argument` on its item, such as `counts[1].oracle_id`.
  - A basic land card that the request leaves out keeps its count.
  - It writes one `basic_lands` deck change with a line for each basic land card whose count changed. A request that changes nothing makes no deck change, and leaves the revision and the last used time as they are.
  - `deck_basic_lands` holds the count of each basic land card above zero, by deck. `deck_change_basic_lands` holds the basic land lines of deck changes: the basic land card and its count before and after.
- `supabase.rpc('list_deck_changes', { query: { deck_id, cursor, limit } })` returns `items`, the deck's deck changes newest first, and `next_cursor`. The History tab reads it.
  - A page has 20 deck changes, or `limit`, from 1 to 50. To read the next page, send `next_cursor` back as `cursor`. It is null on the last page. A deck change made after the first page does not repeat one on the next page. A cursor that is not valid, that comes from another deck, or that is older than 15 minutes is refused with `invalid_cursor` on `cursor`.
  - Each deck change has `deck_change_id`, `revision`, `kind`, `changed_at`, `reverted`, and `lines`. `reverted` is true when a revert undid it.
  - A copy line has `kind` `copy`, `copy_id`, the card's `name`, the `image_uris` of the line's card printing, the card's `type_line`, and `place_before` and `place_after`. A deleted copy's lines still show its card. Lines sort by card name.
  - A basic land line has `kind` `basic_land`, the basic land card's `oracle_id`, its `name`, the `image_uris` of its basic land image, and `count_before` and `count_after`. Basic land lines follow the copy lines, in the order of the twelve kinds.
- Reverting a deck change undoes it and every later deck change in that deck, as one new `revert` deck change. Each copy and basic land card that the range touched goes back to its place or count before the reverted deck change. One private function computes the effect, and the revert preview and the revert both use it.
- `supabase.rpc('preview_revert', { query: { deck_id, deck_change_id } })` returns the effect without changing anything. The revert page sheet reads it.
  - `revision` is the deck revision. Send it back as `expected_revision`.
  - `lines` has the lines the revert would write, in the shape of `list_deck_changes` lines.
  - `blocks` lists each copy that must come back but was deleted or is in another deck, with `copy_id`, the card's `name`, and `deck`, the other deck's `deck_id` and `name`, or null for a deleted copy.
  - `protected_copies` lists each protected copy that comes back, with `copy_id` and `name`.
- `supabase.rpc('revert_deck_changes', { request: { deck_id, deck_change_id, expected_revision, unprotect } })` applies the effect. It returns `deck_id` and the new `revision`.
  - It writes one `revert` deck change with the effect's lines, and sets `reverted_by` on every deck change in the range that no revert undid yet. A revert can be reverted too.
  - A restored commander is made a commander again at the time of the revert.
  - An `expected_revision` that is not the deck revision is refused with `stale_revision` on `expected_revision`.
  - A block is refused with `revert_blocked` on `deck_change_id`. The message names the card, such as "Cyclonic Rift is no longer in your collection." or "Sol Ring is in Kinnan.".
  - A protected copy that comes back is refused with `copy_protected` on `unprotect` unless `unprotect` is true. Then it unprotects the copy in the same transaction.
  - A deck change of another deck or another user is refused with `not_found` on `deck_change_id`.
- The write functions check the caller's identity and run in one transaction each. The reads run with the caller's rights. Another user's deck is refused with `not_found` on `deck_id`, like one that does not exist. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Deck evaluations

mtgscan judges each deck against the Commander rules and stores the result as one deck evaluation per deck. `docs/adr/0006-store-deck-evaluations-and-recompute-them-after-rules-data-imports.md` says why. `supabase/decks.ts` has the shared types.

- `deck_evaluations` holds one row per deck that has a card, with the user ID. Deleting a deck deletes its row. mtgscan keeps only the current deck evaluation, with no history.
- A row has `validity` (`valid`, `invalid`, or `cannot_be_determined`), `violations` in a fixed order, `undetermined`, the checks that could not run with their cards and reason, `revision`, the deck revision it judged, `catalog_at`, the snapshot time of the card catalog it read or null before the first catalog import, and `judged_at`.
- One private function, `private.judge_deck`, judges a deck and writes nothing. Its input is the deck's copies, each with its card printing and `commander` or `main`, and each basic land card with its count. Its output is a deck evaluation without the deck revision.
- The validity is `invalid` with any violation, `cannot_be_determined` with no violation and at least one check that could not run, and `valid` otherwise.
- Each violation has `rule`, `citation` or null, `message`, `hint` or null, and `cards`. A card is a copy with `kind` `copy`, `copy_id`, `name`, and `image_uris`, or a basic land card with `kind` `basic_land`, `oracle_id`, `name`, and `image_uris`.
- The violations so far, in their order:

  | Rule | Checks | Citation | Message and hint |
  | --- | --- | --- | --- |
  | `no_commander` | The deck has no commander. The other checks still run. | CR 903.3 | "This deck has no commander." |
  | `deck_size` | The deck does not have exactly 100 cards, commanders and basic lands included. It names no cards. | CR 903.5a | "87 of 100 cards." with "Add 13 cards.", or "101 of 100 cards." with "Remove 1 card." |
  | `singleton` | A card has more copies than its copy limit. Copies of every card printing and both roles count together. Basic lands are exempt. | CR 903.5b | "2 copies of Sol Ring." with "Remove 1 Sol Ring.", one sentence each per card, in name order |
  | `banned` | A card's Commander legality is banned. | none | "Dockside Extortionist is banned in Commander.", one sentence per card |
  | `not_legal` | A card's Commander legality is not legal, such as an Un-card. | none | "Mine Security is not legal in Commander.", one sentence per card |

- The copy limit comes from the card's `copy_limit`: one, any number, or `copy_limit_number`. A second copy of a card with an unknown copy limit makes singleton undetermined for that card, with the reason "mtgscan cannot read the copy limit of Tolabow, Loch Rascal.". One copy of that card makes nothing undetermined.
- A card that the card catalog no longer lists, or whose Commander legality is unknown, makes the legality check undetermined. Its undetermined check has `rule` `legality`, the reason "No rules data for Mine Security.", one sentence per card, and its cards. A banned or not legal card still makes the deck invalid.

- `add_deck_card`, `remove_deck_card`, `set_deck_commander`, `set_basic_lands`, `revert_deck_changes`, and `delete_copy` for a copy in a deck save the deck evaluation in the same transaction, after they change the cards, with the new deck revision. A refused request or one that makes no deck change saves nothing. Creating, renaming, and deleting a deck, and changing its deck priority, save nothing.
- The deck change that adds a deck's first card creates its deck evaluation, and the one that removes its last card deletes it. An empty deck has none.

### Collection search

Signed-in users search their own collection with `supabase.rpc('search_collection', { query })`. It takes the same typed query as catalog search, plus the collection chips and `rows`. `supabase/collection.ts` has the shared types for the query and the result rows. The Collection tab reads its binder grid only through collection search, with `rows: 'copies'`. Its search bar and its Filters drawer turn the typed text and chips into the typed query.

- Chips match copies. `finishes`, `conditions`, and `languages` take the finish, condition, and language values of copies.
- `sets` and `rarities` match the copy's own card printing. `price_min`, `price_max`, and `sort: 'price'` use the current USD price of that card printing and finish. A bound matches a price equal to it, and goes up to 9999999999.99. The app turns a bound in another currency into USD bounds, as Converted prices says. `sort: 'release_date'` uses the release date of that card printing.
- `is_free` matches free copies. A protected copy can be free. `is_protected` matches the protected flag. The Collection tab's Free filter is `is_free: true` with `is_protected: false`.
- `user_tags` and `user_tags_exclude` take user tag names, matched ignoring case. A copy matches `user_tags` when it has every listed user tag, and `user_tags_exclude` when it has none of them. A name that is not one of the caller's user tags is refused with `invalid_argument` on that list item, such as `user_tags[0]`.
- `is_allocated` true matches copies in a deck, and false matches copies in no deck.
- `deck_ids` and `deck_ids_exclude` take up to 10 of the caller's deck IDs. A copy matches `deck_ids` when it is in one of the listed decks, and `deck_ids_exclude` when it is in none of them. An ID that is not one of the caller's decks is refused with `invalid_argument` on that list item, such as `deck_ids[1]`. The server never matches deck names. The Collection tab turns a typed `deck:` name into the IDs of every deck with exactly that name, ignoring case.
- Collection search also returns cards that are not Commander-legal, and copies whose card printing is marked absent.
- `rows` is `entries` or `copies`, and defaults to `entries`.
  - With `entries`, each row is one collection entry: the matching copies that share a card printing, finish, condition, language, and protected flag. A collection entry has no ID of its own. Each row has the quantity, free quantity, allocated quantity, and held quantity of its matching copies. `limit` is 1 to 50 and defaults to 20.
  - With `copies`, each row is one copy, with its `copy_id`. `limit` is 1 to 120 and defaults to 60. The card printing is `printing_id`, `name`, `set`, `collector_number`, `rarity`, and `image_uris`. The copy gives `finish`, `condition`, `language`, and `protected`. `deck` is the copy's deck with `deck_id` and `name`, or null for a copy in no deck.
  - A copy row's `price` is the current USD price of the card printing and finish: `amount` as a decimal string, `currency`, `finish`, and `stale`. `stale` is true when the price snapshot is more than 24 hours old, as `catalog_freshness` says. Condition and language do not change it. `price` is null when `card_prices` has no USD price for that card printing and finish. A price is never taken from another finish.
  - A collection entry row's `price` is the current price of its card printing and finish, in the shape of a copy row's `price`. Its `total` is the entry total: `price` times the row's `quantity`, as a USD decimal string. An AI chat converts both with the shared module. Condition and language do not change either. Both are null when `price` is null.
- `sort` is `relevance` by default, with or without text. Without text, relevance means `added`, so an empty query lists the newest addition first.
- `sort: 'added'` lists the card printing with the newest addition first. Its copies sit next to each other. `sort_order: 'asc'` puts the oldest addition first.
- Rows with the same sort value sort by name, then by card printing ID, then by copy ID.
- Each row counts the copies in the collection availability view. The view has one row for each copy of the caller, with its allocated, held, and free flags. A copy in a deck is allocated. Held stays false until planned swaps exist.
- Collection search runs with the caller's rights, like catalog search. The views set `security_invoker`, so the read policy on `copies` keeps only the caller's rows.
- Catalog search, `get_cards`, and `list_card_printings` read owned quantities from the same view. A printing list keeps an absent card printing when the caller owns it.
- A first page also has `total_count`, the number of matching rows. Later pages have `total_count: null`. The Collection tab shows it in its count line, such as "6 of 27 copies".
- A first page with text or a filter writes one row to `search_telemetry` with the API `collection`. A read with no text and no filter writes none, so a plain binder read is not recorded. `rows`, `sort`, `sort_order`, `limit`, and `include_oracle_text` are not filters. The secret key cannot call collection search.

### Search release check

`bun run release-check` in `supabase` runs every search in the graded search corpus through catalog search with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It reports whether search is ready to release. It exits with a failure unless every exact-name search ranks its card first, classes 2 to 4 each reach a capped recall@20 of 0.7 or more, and no returned card fails a chip in its query. The Release check workflow runs it by hand against the hosted project. It never runs on pull requests or on a schedule. `supabase/release-check/README.md` describes the corpus, the grading rule, and the report.

### Card catalog imports

`bun run import <command>` in `supabase` runs an import with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Pass `--manifest <path>` to read a fixture instead of the Scryfall bulk data manifest. Pass `--variants <path>` to read a fixture instead of the Commander Spellbook variants file. Pass `--sets <path>` to read a fixture instead of the Scryfall sets list. Pass `--rates <path>` to read a fixture instead of Frankfurter's latest exchange rates.

- `catalog` imports cards and card printings. Each card printing keeps `image_uris`, the Scryfall `normal` image of each face, and `art_crop_uri`, the Scryfall `art_crop` image of its front face or null. After the run, even a skipped one, it reads Scryfall's sets list in one request and adds or updates `card_sets`: each set's code, name, and `icon_svg_uri`. Some sets use the icon of a parent set, so the app reads the icon from this table, not from a URL pattern. Signed-in users can read `card_sets`. The Weekly import workflow runs it.
  - The run reads the deck-construction fields from each card's Oracle text and stores them on the card. Deck validity reads them as rules data. The reader leaves out reminder text and an ability word before " — ", as in Clara Oswald's "Impossible Girl".
    - `has_partner` is true for Partner and for Partner—[text]. `partner_text` holds the text, such as "Friends forever", or null for plain Partner.
    - `partner_with_name` holds the name after Partner with, or null.
    - `has_choose_a_background` is true for Choose a Background. `has_doctors_companion` is true for Doctor's companion.
    - `commander_chooses_a_color` is true for "If [name] is your commander, choose a color before the game begins. [name] is the chosen color."
    - `copy_limit` is `one`, `any_number`, `number`, or `unknown`. "A deck can have only one card named [name]." gives `one`. "A deck can have any number of cards named [name]." gives `any_number`. "A deck can have up to seven cards named [name]." gives `number`, with 7 in `copy_limit_number`.
    - A field is unknown when the Oracle text mentions the ability but mtgscan does not recognize the line. An unknown yes-or-no field is null, and an unknown copy limit is `unknown`. A Partner with line that mtgscan does not recognize makes `has_partner` null. A card that does not mention an ability gets false, null text, and a copy limit of `one`.
    - Whether a card is a Background or a Time Lord Doctor, and its basic land types, come from its type line. The catalog stores the type line, so these need no field of their own.
- `oracle_tags` imports Oracle tags, tag edges, and card taggings from Scryfall. The Weekly import workflow runs it after `catalog`, even when the catalog run fails.
- `commander_spellbook` imports combos, as `GLOSSARY.md` defines them, from the Commander Spellbook variants file. It drops and counts each combo that names a card outside the card catalog or has no Oracle ID. The Weekly import workflow runs it after `oracle_tags`, even when an earlier run fails.
- `prices` imports current prices from Scryfall Default Cards and recomputes each card's lowest current price. It reads only the USD prices, `usd`, `usd_foil`, and `usd_etched`. A card printing with no USD price has no current price, even when Scryfall has a EUR price. `docs/adr/0005-convert-all-prices-from-usd.md` says why.
- `exchange_rates` imports the latest exchange rates from Frankfurter, which publishes the European Central Bank's reference rates. mtgscan keeps one row for each currency in Frankfurter's latest rates, and one for USD at a rate of 1. A currency that leaves the latest rates is removed, and a new one is added. Each row holds the currency, the rate from USD, and the ECB date of the rate. Each run replaces the rows. The ECB publishes rates on working days only. A run whose ECB date is not newer than the stored one is skipped. Signed-in users can read `exchange_rates`.
- `prune-telemetry` deletes search telemetry older than 180 days.
- `retry-weekly` runs again each weekly source whose latest run failed.

`bun run oracle-tag disable <tag UUID>` stops a bad Oracle tag from matching any search. `bun run oracle-tag enable <tag UUID>` undoes it. The Oracle tag workflow runs the same command by hand. A disabled tag stays disabled after every later tag import.

The Daily import workflow runs `prices`, `exchange_rates`, `prune-telemetry`, and `retry-weekly`. A failed step fails the workflow run, and the later steps still run. Each run records an import run, so the hosted project does not pause. The Import workflow runs one source by hand.

### Per-user data

Every table that holds a user's data follows one pattern:

- Row-level security is on, and the read policy returns only the signed-in user's rows.
- Direct inserts, updates, and deletes are revoked for the `anon` and `authenticated` roles.
- Changes go only through database functions. Each function runs in one transaction and checks the caller's identity.
- Reads run with the caller's rights, so the read policy decides which rows the caller sees. Read functions are `security invoker`, and views over a user's data set `security_invoker`. No read function filters on the caller itself.

The tables with a user's data are `profiles`, `copies`, `collection_additions`, `collection_addition_lines`, `collection_addition_copies`, `user_tags`, `copy_user_tags`, `decks`, `deck_cards`, `deck_basic_lands`, `deck_changes`, `deck_change_lines`, `deck_change_basic_lands`, and `deck_evaluations`. `search_telemetry` departs from the pattern, as Catalog search says. App roles cannot write `search_telemetry`. Searches write their telemetry row through `private.record_search`. It runs with the owner's rights.

The `anon` role cannot use the `private` schema. `authenticated` and `service_role` can use it. Every `private` function is closed by default. A migration grants `execute` on a helper only to the roles whose functions call it.

Signing up creates the user's profile through a trigger on `auth.users`.
