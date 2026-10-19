# mtgscan

An iPhone app for scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. The first release is iOS only. Android comes later. An authenticated remote MCP service lets compatible AI chats search the card catalog and collection, inspect decks, plan swaps, and add to the buylist. It cannot change decks or the collection.

## Development

The repo is a Bun workspace. The Expo app lives in `apps/mobile`. The public website, with the homepage, the privacy policy, the consent page, and the problem pages, lives in `apps/site`. It is static HTML, and only the consent page has a script.

1. Install dependencies with `bun install`.
2. Build and open the development build in the iOS simulator with `bun run --filter @mtgscan/mobile ios`.

Public build-time settings go in `apps/mobile/.env`. `apps/mobile/.env.example` lists their names. Never put a service role key in the app.

Checks run on pull requests that change what they check. The app checks run when the app, the workspace files, or the `@mtgscan/supabase` modules that the app imports change. The database checks run when anything in `supabase` changes. The site checks run when `apps/site`, `wrangler.jsonc`, the workspace files, or the `@mtgscan/supabase` modules that the site imports change. A pull request that changes none of them, such as a docs change, runs only the title check. `.github/workflows/checks.yml` lists the paths. Run the checks locally with `bun run typecheck`, `bun run lint`, and `bun run test`.

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

- `atoms` holds the primitives: `Text`, `TextLink`, `Button`, `Chip`, `StatusChipButton`, `Toggle`, `Switch`, `Surface`, `GlassSurface`, `GlassGroup`, `CardImage`, `CardThumbnail`, `TileButton`, `AppleSignInButton`, `Input`, `ProgressBar`, `Skeleton`, `SetIcon`, `DimSymbol`, `QuickActionButton`, `CountBadge`, `FloatingMenuButton`, `NameAlert`, `CardContextMenu`, and `ManaSymbol`. `Button` has a 50 px sign-in size and the Google variant. `StatusChipButton` is a status chip that the user can tap, such as the validity chip and the bracket chip of the deck screen header. `AppleSignInButton` wraps the system Apple button. `Toggle` wraps `@rn-primitives/toggle`. `Switch` wraps the iOS switch. `NameAlert` is a native SwiftUI alert from `@expo/ui` with a name field, Cancel, and a confirm button that is off while the trimmed name is empty. `FloatingMenuButton` is a round 48 px button on a `GlassSurface` that opens a native SwiftUI menu from `@expo/ui`, with a title and choices that can have a check mark and a symbol. `CardContextMenu` wraps a card in a native SwiftUI context menu from `@expo/ui` that opens on a long press, with the card as its preview. `GlassSurface` and `GlassGroup` wrap `GlassView` and `GlassContainer` from `expo-glass-effect`, and fall back to plain views when `isLiquidGlassAvailable()` is false. Inside a `GlassSurface`, `Text`, `QuickActionButton`, `Skeleton`, `CardThumbnail`, and `DimSymbol` take the glass colors.
- `molecules` holds `ChipGroup`, `ToggleGroup` (a segmented control on `@rn-primitives/toggle-group`, with an optional count badge on each option), `ListRow`, `SwitchRow`, `EmptyState`, `CardTile`, `CardGrid`, `AccountCard`, `GalleryCard`, `FailureNotice`, `Brand`, `QuickActionBar`, `SheetSection`, `BatchButton`, `CopyMeta`, `PriceLine`, `SwipeToConfirm`, `ThumbnailChip`, `CardChip`, `RuleRow`, `BracketSignalRow`, `SymbolText`, `CommanderCard`, `CommanderGalleryCard`, `SortButton`, `GroupButton`, `Stepper`, and `StepperRow`. `CardTile` is a card image with its set and collector number, 3 to a row, with an optional long-press menu. The binder grid and the card printing grids on the Scan tab use it. A `CardTile` can show an ∞ count badge on the image, as the basic land tiles of Collection do. A `CardTile` can have a long-press menu with no tap action, as the basic land tiles of a deck do. A `CardTile` can have the danger outline, as the tiles of cards that break a Commander rule do. `CardChip` is a card's thumbnail and name in a chip. `RuleRow` is a rule row of the Deck validity drawer, and `BracketSignalRow` is a bracket signal row of the Estimated bracket drawer. `Stepper` is a minus button, a count, and a plus button. `StepperRow` is a row with a card thumbnail, a name, and a `Stepper`, as in the Add to deck drawer for a basic land. `SymbolText` shows text with its card symbols, such as {G} or {T}, drawn with the Mana font. `CommanderCard` is the 140 px deck card of the Decks gallery, with the first commander's art and the second commander's avatar, and `CommanderGalleryCard` is its gallery button, with the deck's Needs you count badge. `DeckBanner` is the deck screen banner with the same art and avatar. It runs edge to edge from the top of the screen and is 200 px tall below the safe area. The ghost commander card of the Decks empty state uses the same frame. `SortButton` is the round sort button that Collection and the deck screen's Cards tab share. It is a `FloatingMenuButton` with a "Sort by" menu and an arrow for the direction of the current sort. `GroupButton` is the round group button of the Cards tab, a `FloatingMenuButton` with a "Group by" menu. `ThumbnailChip` is a chip on a `GlassSurface` with three columns: a thumbnail, a flexible middle, and an optional accessory. The side columns have the same fixed width, so the middle is centered. A chip with an action is a button on glass that reacts to touch. The latest-scan chip uses it. `ChangeLine` is a green + or red − row of a deck change, a planned swap, or a buylist card, with a thumbnail, the card name, and a meta line. `Reason` is the reason of a planned swap, buylist card, or deck change in body text, with a meta line such as the AI client name.
- `organisms` holds `BinderWall`, `SignInSheet`, `SettingsContent`, `collectionTotalMenu` (the collection total menu item for the tab header), `collectionFiltersButton` (the Filters bar button on Collection), `CollectionFilters` (the chips of the Filters drawer), `DeckCards` and `DeckCardOrderButtons` (the Cards tab of the deck screen and its group and sort buttons), `DeckHistory` (the History tab), `NeedsYouCard` (a planned swap or buylist card, with its deck tag on Recent, change lines, effect chip, reason, **Swap in** or **Bought**, and **Close**), `NeedsYouList` (the `NeedsYouCard`s of Recent and the Planned tab, with their writes and alerts), `SwapInAllButton` (the **Swap in all** button of the Planned tab, with its alerts), `DeckValidityContent` and `EstimatedBracketContent` (the content of the Deck validity and Estimated bracket drawers), `batchReviewMenu` (the ••• menu in the batch review bar), and the Scan tab sections: `LatestScanControls`, `LatestScanChip`, `ScanQuickActions`, `ScanDetails`, `ScanDetailsContent`, `NameSearch`, `PrintingPicker`, and `ScanBatchList`. `templates` holds `TabStack`, `TabScreen`, `TabListScreen`, `PushedScreen`, `FloatingButtons`, `DrawerSheet`, and `ChoiceSheet`. `TabStack` is the native stack of Recent, Collection, and Decks, with the large title header. The Collection stack also presents the Filters drawer. `CollectionSearchProvider` wraps that stack and holds the search text and chips, so the tab and the drawer share them. `TabScreen` and `TabListScreen` set the tab header title, put optional header actions and the settings button in the native bar, and scroll the content under it. `TabListScreen` and `PushedScreen` can float buttons in a `FloatingButtons` row at the bottom right, 8 px apart. They sit 16 px above the tab bar on a tab, and 16 px above the bottom safe area on a pushed screen. `DrawerSheet` is the content layout of the bottom drawers, with an optional footer below the content that scrolls, such as the **Add to collection** swipe of batch review. Its module also holds the screen options for half-height and full-height drawers, for a drawer screen with a title bar, and for a screen pushed inside a drawer. `ChoiceSheet` is a short drawer with one chip for each value, used by the condition and language pickers. Batch review is a stack inside its drawer: the list, and the scan details pushed over it. `ScanDetails` is the scan details content for both the scan details drawer and batch review.
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

The owner builds the gallery on the Mac at each set release with `bun run gallery <command>` in `supabase`. #75 describes the format. The commands read `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. When `SUPABASE_URL` is not set, they use `https://<ref>.supabase.co` from `SUPABASE_PROJECT_REF`. For the hosted project, `SUPABASE_PROJECT_REF` and `SUPABASE_SECRET_KEY` live only in `supabase/.env.hosted`, which Git ignores and Bun does not load by itself. Run a command with them as `bun --env-file=.env.hosted gallery/main.ts <command>`. `docs/agents/local-development.md` (Gallery build) has the rules.

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

### AI clients

The settings drawer lists the AI clients that the user allowed, from `supabase.auth.oauth.listGrants()`. **Revoke** calls `revokeGrant()` and removes the row when it works. `src/lib/app-config.ts` reads the Supabase URL and the publishable key from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It makes the MCP server URL from the Supabase URL as `<Supabase URL>/functions/v1/mcp`, so the app has no second setting to keep in sync. **Copy** puts it on the clipboard with `expo-clipboard`. `expo-clipboard` is a native module, so a change to it needs a new native build.

### Local Supabase

The Supabase project lives in `supabase`: configuration, SQL migrations, generated types, and database tests. The local stack needs Docker and the Supabase CLI 2.120.0.

1. Copy `supabase/.env.example` to `supabase/.env` and fill in the Google client IDs, web ID first, then iOS ID, separated by a comma. Native Google sign-in does not use the secret. Leave `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` empty. Only Apple sign-in on the consent page uses it, and the consent page talks to hosted Supabase. Native Sign in with Apple does not use a secret. MCP connection (Apple web client secret) explains the Apple client IDs.
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
- The owner seeds or resets the hosted test user with the sample collection and the sample deck from `supabase` in the main checkout: `bun --env-file=.env.hosted --env-file=$HOME/.config/mtgscan/test-app.env test-user/main.ts --hosted --sample-collection`. The command builds the hosted URL from `SUPABASE_PROJECT_REF` in `.env.hosted`, or reads it from `SUPABASE_URL`. It refuses a missing URL, the local stack, a missing password, and the local default password.
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
- Prices are in USD. No price read takes `price_currency`. A query that sends it, even `USD`, is refused with `invalid_argument` on `price_currency`, so an old build fails loudly. The app converts prices itself, as Converted prices says. The MCP connection returns USD. Collection search, `get_cards`, the collection total, the current prices read, and the copy read take the same rule.
- Each row's `price_from` is the card's lowest current price in USD. A card with no lowest current price has no `price_from`.
- `price_min` and `price_max` are USD amounts. They compare with the lowest current price, and a bound matches a price equal to it. `sort: 'price'` uses the USD amount.
- `get_cards` takes `oracle_ids` or `printing_ids`. Its `price_from` is as in catalog search.
- `get_cards` reads card details for up to 20 cards. Each card lists its direct Oracle tags that are not disabled, as `slug` and `label`, sorted by label. Each card also lists up to 5 combos as `combos`. Each combo has its `spellbook_id`, the `other_card` with its Oracle ID and name, its produced features, and its bracket tag. Combos sort by the other card's EDHREC rank, with missing ranks last, then by the other card's name, then by Spellbook ID. A card with no combos has an empty list.
- Each first page writes one row to `search_telemetry`. It is the one table with user data that has no read policy: app users cannot read it, and only the secret key can.
- The telemetry row has the caller `app`, or `mcp` when the token has a `client_id`, as an AI client's token does.
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

mtgscan stores every price in USD, and every read returns USD. The app converts prices into the price currency with the shared module `supabase/converted-prices.ts` (`@mtgscan/supabase/converted-prices`). The MCP connection returns USD only. `docs/adr/0005-convert-all-prices-from-usd.md` says why.

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

### Sets list

Signed-in users read Sets with `supabase.rpc('list_sets')`. It takes no query. `supabase/sets.ts` has the shared types.

- The result has `items`, one row for every set with a `released_at` on or before the current date and at least one card printing in the card catalog. A set with no `released_at` counts as not released.
- The rows come newest first, then by name. Every row comes in one response, with no paging. The app filters them by the search text.
- Each row has `code`, `name`, `icon_svg_uri`, `released_at`, and `completion`, the set completion in each finish view as `{ owned, size }` under `any`, `nonfoil`, and `foil`.
- `size` counts the card printings in the set's main set that the finish view does not leave out. `owned` counts those with at least one of the caller's copies in the finish view. A card printing counts once, whatever the condition, language, protected flag, or deck of its copies.
- Any finish counts every copy. Nonfoil counts the nonfoil copies, or every copy when the card printing has no nonfoil finish. Foil counts the foil and etched copies, and leaves out a card printing with neither finish. `private.set_card_printing_counts` holds this rule. The app only picks the finish view.
- Each row also has `set_art_uri`, the set art from `GLOSSARY.md`. It is the art crop of the set's card printing with the highest current USD price in any finish, among the card printings with an art crop. A tie goes to the lower collector number. With no priced card printing, it is the art crop of the first card printing that has one, by collector number. With no art crop in the set, it is null. Variants and basic lands can give the set art.
- One private function, `private.set_card_printings`, applies the main set rule from `GLOSSARY.md`. Basic land cards are never in the main set or the variants.
- The function runs with the caller's rights. An anonymous caller and the secret key are refused.

### Set read

Signed-in users read one set with `supabase.rpc('get_set', { query })`. The set page reads through it. `supabase/sets.ts` has the shared types.

- The query has `code`, the set code, such as `blb`.
- The result has the fields of the set's `list_sets` row, then `main_set` and `variants`.
- `main_set` lists the card printings of the main set. `variants.card_printings` lists the variants, and `variants.completion` is their own set completion in each finish view. Basic land cards are in neither list.
- Both lists come in collector number order. Numbers sort by their leading digits, then as text, so "9" comes before "10" and "10a".
- Each card printing has `printing_id`, `name`, `collector_number`, `image_uri` (the front face image, or null), `finishes`, and `counts`, the number of the caller's copies under `any`, `nonfoil`, and `foil`. `counts.foil` is null when the card printing has no foil or etched finish.
- `list_sets` and `get_set` share the main set rule and the set completion count, so a set's completion is the same in both reads.
- The function runs with the caller's rights. An anonymous caller and the secret key are refused. A set code that is unknown, not released, or has no card printing in the card catalog has the code `not_found` and the field `code`. A refused query has the code `invalid_argument` and the field at fault.

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
- `held_for` is the deck of the open planned swap that holds the copy, with `deck_id`, `name`, and `commander_art_crop_uri`. It is null for a copy that no planned swap holds. `free` is false for a held copy.
- The function runs with the caller's rights, so another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist. A refused query has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Protect a copy

Signed-in users protect or unprotect one of their copies with `supabase.rpc('set_copy_protected', { request })`. The request has `copy_id` and `protected`, `true` or `false`. `supabase/collection.ts` has the shared types. The copy page's actions menu calls it.

- It changes only that copy, in one transaction, and returns `copy_id` and `protected`. Doing what is already done changes nothing.
- Only a free copy can be protected. Protecting a copy that is not free, such as a copy in a deck, is refused with `copy_not_free` on `copy_id`.
- Another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Copy delete

Signed-in users delete one copy with `supabase.rpc('delete_copy', { request })`. The request has `copy_id` and, for a held copy, `move_planned_swap: true`. `supabase/collection.ts` has the shared type. The copy page deletes its copy through it.

- It deletes the copy in one transaction. The copy leaves collection search, `get_copy`, owned quantities, and the collection total and its coverage.
- A held copy is refused with `copy_held` on `move_planned_swap`, and nothing changes, unless the request has `move_planned_swap: true`. The message names the card and the deck of the planned swap. With `move_planned_swap: true`, the delete moves that planned swap to the buylist with the note `held_copy_deleted`. See Planned swaps. On a copy that is not held, `move_planned_swap` changes nothing.
- A copy in a deck leaves its deck first, with one `removed_from_collection` deck change. It raises the deck revision by one and sets the last used time. Its line keeps the card printing and finish. History still shows the card. Deleting a copy in no deck makes no deck change.
- The copy's addition, its addition line, and its copy ID in `collection_addition_copies` stay. A replayed scan batch never adds the copy again.
- It returns nothing. Another user's copy is refused with `not_found` on `copy_id`, like a copy that does not exist or was already deleted. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### User tags

A user tag is a private label that a user puts on copies. `user_tags` holds each user tag with its user, its name, and its created time. The name is trimmed of white space at both ends and has 1 to 64 characters. A user's user tag names are unique ignoring case. `copy_user_tags` links copies to user tags, with the user ID. Deleting a copy or a user tag removes its links. `supabase/collection.ts` has the shared types.

- `supabase.rpc('create_user_tag', { request: { name } })` trims the name, creates the user tag, and returns its `user_tag_id` and `name`. A name that matches one of the user's user tags ignoring case is refused with `user_tag_exists` on `name`.
- `supabase.rpc('set_copy_user_tag', { request: { copy_id, user_tag_id, tagged } })` puts the user tag on the copy when `tagged` is true and takes it off when it is false. It returns nothing. Doing what is already done changes nothing. Putting a user tag on a copy or taking it off changes no collection entry.
- `supabase.rpc('rename_user_tag', { request: { user_tag_id, name } })` trims the name and renames the user tag. It keeps the ID, so every copy shows the new name. It returns `user_tag_id` and `name`. A name that matches another of the user's user tags ignoring case is refused with `user_tag_exists` on `name`.
- `supabase.rpc('delete_user_tag', { request: { user_tag_id } })` deletes the user tag and takes it off every copy. It returns nothing.
- `supabase.rpc('list_user_tags')` returns `items`: the caller's user tags with `user_tag_id`, `name`, and `copy_count`, sorted by name ignoring case. It runs with the caller's rights. It takes an optional `query`, an empty object, as the MCP server sends. A query with a field is refused with `invalid_argument` on that field.
- The write functions check the caller's identity and run in one transaction each. Another user's copy or user tag is refused with `not_found` on `copy_id` or `user_tag_id`, like one that does not exist. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Decks

A deck is a Commander deck, as `GLOSSARY.md` defines it. `decks` holds each deck with its user, its name, its deck priority, its deck revision, its created time, and its last used time. `supabase/decks.ts` has the shared types.

- The name is trimmed of white space at both ends and has 1 to 64 characters. Two decks can have the same name.
- The deck priority is `high`, `medium`, or `low`. A new deck starts at `medium`.
- The deck revision starts at 0.
- `supabase.rpc('create_deck', { request: { name } })` trims the name and creates an empty deck with no commander. It returns `deck_id`. Creating a deck counts as using it.
- `supabase.rpc('mark_deck_used', { request: { deck_id } })` sets the deck's last used time. The deck screen calls it when it opens. It returns nothing.
- `supabase.rpc('list_decks')` returns `items`: the caller's decks with `deck_id`, `name`, `priority`, `card_count`, `commanders`, `last_used_at`, `revision`, `evaluation`, and `needs_you_count`. The deck used most recently comes first. Decks used at the same time sort by name ignoring case. `card_count` counts the deck's commanders, main deck, and basic lands. `commanders` lists each commander's `copy_id`, `name`, and `art_crop_uri`, the oldest commander first. `evaluation` is null for an empty deck. Otherwise it has the `validity`, `validity_stale`, `estimated_bracket`, and `bracket_stale` of the deck evaluation. Deck evaluations (Freshness) says when each is stale. `needs_you_count` is the number of the deck's open planned swaps and buylist cards, as Needs you says. It takes an optional `query`, an empty object, as the MCP server sends. A query with a field is refused with `invalid_argument` on that field.
- `supabase.rpc('get_deck', { query: { deck_id } })` returns the fields of a `list_decks` item except `needs_you_count`, plus `created_at`, `cards`, and `basic_lands`. Reading a deck does not count as using it.
  - `evaluation` is null for an empty deck. Otherwise it has every stored field of the deck evaluation, as Deck evaluations says, and `validity_rules_data_at`, the snapshot time of the card catalog that the validity used. `bracket_rules_data_at` is the oldest of `catalog_at`, `oracle_tags_at`, and `commander_spellbook_at` that is not null. `no_oracle_tag_data` and `no_combo_data` are true when the deck evaluation read no Oracle tag or combo snapshot. It also has `validity_stale` and `bracket_stale`.
  - `cards` lists every copy in the deck. Each has its card printing as in a copy row of collection search, its `finish`, `condition`, `language`, `protected`, and `price` with `stale`. It adds `role` (`commander` or `main`), `commander_at`, the time the card was made a commander or null, `added_at`, the time the copy went into the deck, and its card's `type_line`, `mana_value`, and `colors`. `planned_out` is true when an open planned swap of the deck takes the copy out. A buylist card never marks a copy. The app groups and sorts the cards.
  - `basic_lands` lists the twelve basic land cards in order: Plains, Island, Swamp, Mountain, Forest, Wastes, and the snow-covered version of each. Each has its card's `oracle_id`, its `name`, the `image_uris` of its basic land image, and its `count`, 0 when the deck has none. A basic land card that the card catalog does not have has a null `oracle_id` and no image.
  - The basic land image is the image of one card printing of that basic land, chosen the same way each time: a printing with an image first, then English, then one with a nonfoil finish, then the newest, then by set code and collector number. The lookup finds each basic land card through the `name_key` index, so it reads only those cards from the card catalog.
- `supabase.rpc('rename_deck', { request: { deck_id, name } })` trims the name and renames the deck. It returns nothing.
- `supabase.rpc('set_deck_priority', { request: { deck_id, priority } })` sets the deck priority. It returns nothing.
- Renaming a deck and setting its deck priority count as using it. Neither is a deck change, and neither raises the deck revision.
- `supabase.rpc('delete_deck', { request: { deck_id } })` deletes the deck, its deck cards, its basic lands, its deck changes, its planned swaps, and its buylist cards. Its copies become free, and so do the copies that its planned swaps held. It returns nothing.
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
- Each change to a deck's cards is one deck change. It locks the deck, raises the deck revision by one, and sets the last used time. `deck_changes` holds each deck change with its deck, its user, the `revision` it made, its `kind`, its `changed_at` time, and `reverted_by`, the revert that undid it, or null. A `swapped_in` deck change also keeps the `reason` and the `client_name` of its planned swap, and a `bought` deck change those of its buylist card. Other deck changes have null for both. `deck_change_lines` holds one line per copy that the deck change moved: the copy ID, its card printing, its finish, and its place before and after, `commander`, `main`, or null for out of the deck. A line keeps the card printing and finish so that it can still show the card after the copy is deleted. Deleting a deck deletes its deck changes.
- `supabase.rpc('change_basic_land', { request: { deck_id, oracle_id, by } })` adds or removes basic lands of one basic land card. `by` is the change in its count: 1 to 99 adds that many, and −1 to −99 removes that many. The app adds from the Add to deck drawer and removes one at a time. It returns `deck_id` and the `revision`.
  - Only the twelve basic land cards are accepted. Any other card is refused with `invalid_argument` on `oracle_id`. A `by` of 0, outside −99 to 99, or one that leaves the count below 0 or above 99 is refused with `invalid_argument` on `by`.
  - It writes one `basic_lands` deck change with one line.
- `supabase.rpc('list_basic_land_cards')` returns `items`: the twelve basic land cards in order, each with its `oracle_id`, `name`, and the `image_uris` of its basic land image, as in `get_deck`. A basic land card that the card catalog does not have is left out. Collection reads it for its basic land tiles, and the Add to deck drawer for its stepper row.
  - `deck_basic_lands` holds the count of each basic land card above zero, by deck. `deck_change_basic_lands` holds the basic land lines of deck changes: the basic land card and its count before and after.
- `supabase.rpc('list_deck_changes', { query: { deck_id, cursor, limit } })` returns `items`, the deck's deck changes newest first, and `next_cursor`. The History tab reads it.
  - A page has 20 deck changes, or `limit`, from 1 to 50. To read the next page, send `next_cursor` back as `cursor`. It is null on the last page. A deck change made after the first page does not repeat one on the next page. A cursor that is not valid, that comes from another deck, or that is older than 15 minutes is refused with `invalid_cursor` on `cursor`.
  - Each deck change has `deck_change_id`, `revision`, `kind`, `changed_at`, `reverted`, `reason`, `client_name`, and `lines`. `reverted` is true when a revert undid it. History shows the reason in body text and the client name in meta text under the lines.
  - A copy line has `kind` `copy`, `copy_id`, the card's `name`, the `image_uris` of the line's card printing, the card's `type_line`, and `place_before` and `place_after`. A deleted copy's lines still show its card. Lines sort by card name.
  - A basic land line has `kind` `basic_land`, the basic land card's `oracle_id`, its `name`, the `image_uris` of its basic land image, and `count_before` and `count_after`. Basic land lines follow the copy lines, in the order of the twelve kinds.
- Reverting a deck change undoes it and every later deck change in that deck, as one new `revert` deck change. Each copy and basic land card that the range touched goes back to its place or count before the reverted deck change. One private function works out what the revert changes, and the revert preview and the revert both use it.
- `supabase.rpc('preview_revert', { query: { deck_id, deck_change_id } })` returns what the revert would change, without changing anything. The revert page sheet reads it.
  - `revision` is the deck revision. Send it back as `expected_revision`.
  - `lines` has the lines the revert would write, in the shape of `list_deck_changes` lines.
  - `blocks` lists each copy that must come back but was deleted or is in another deck, with `copy_id`, the card's `name`, and `deck`, the other deck's `deck_id` and `name`, or null for a deleted copy.
  - `protected_copies` lists each protected copy that comes back, with `copy_id` and `name`.
  - `held_copies` lists each copy that comes back and that an open planned swap holds, with `copy_id`, `name`, and `deck`, the planned swap's `deck_id` and `name`. A held copy is not a block.
  - `effect` is the revert's effect, or null. See Previews.
- `supabase.rpc('revert_deck_changes', { request: { deck_id, deck_change_id, expected_revision, unprotect } })` makes those changes. It returns `deck_id` and the new `revision`.
  - It writes one `revert` deck change with the preview's lines, and sets `reverted_by` on every deck change in the range that no revert undid yet. A revert can be reverted too.
  - A restored commander is made a commander again at the time of the revert.
  - An `expected_revision` that is not the deck revision is refused with `stale_revision` on `expected_revision`.
  - A block is refused with `revert_blocked` on `deck_change_id`. The message names the card, such as "Cyclonic Rift is no longer in your collection." or "Sol Ring is in Kinnan.".
  - A protected copy that comes back is refused with `copy_protected` on `unprotect` unless `unprotect` is true. Then it unprotects the copy in the same transaction.
  - It moves the planned swap of each held copy that comes back to the buylist, with the note `held_copy_reverted`. See Planned swaps.
  - A deck change of another deck or another user is refused with `not_found` on `deck_change_id`.
- The write functions check the caller's identity and run in one transaction each. The reads run with the caller's rights. Another user's deck is refused with `not_found` on `deck_id`, like one that does not exist. A refused request has the code `invalid_argument` and the field at fault. An anonymous caller and the secret key are refused.

### Planned swaps

A planned swap is an AI client's plan to put a free copy that the user owns, or one more basic land, into a deck, optionally in place of a deck card or one of its basic lands. It holds the copy until the user swaps it in or the planned swap closes. A planned swap for a basic land holds no copy. Only AI clients make planned swaps, through the MCP connection. `docs/adr/0008-let-ai-clients-make-planned-swaps-and-buylist-cards.md` says why. `supabase/planned-swaps.ts` has the shared types.

- `planned_swaps` holds each planned swap with its user, its deck, the held copy (`incoming_copy_id`) and its card, `as_commander`, the optional outgoing copy and its card or outgoing basic land card, the `reason`, the `status`, the `close_note`, the AI client's `client_id` and `client_name`, `created_at`, and `status_changed_at`. The status is `open`, `swapped_in`, `closed`, or `moved_to_buylist`. Only an open planned swap can change. The copy columns have no foreign key, so a planned swap keeps its card after its copy is deleted. Deleting a deck deletes its planned swaps.
- A partial unique index lets an open planned swap hold a copy only once. The collection availability view marks that copy held. `get_copy` and the copy rows of collection search name its planned swap's deck in `held_for`.
- Deleting a held copy, or a revert that brings a held copy back into a deck, moves its planned swap to the buylist. The planned swap becomes `moved_to_buylist` with the note `held_copy_deleted` or `held_copy_reverted`. A new open buylist card gets the same deck, incoming card, `as_commander`, outgoing card, reason, AI client, and `created_at`, so it keeps its place on Recent. When an open buylist card in the deck already has the same deck, incoming card, `as_commander`, and outgoing card, the move makes no second one. Both writes lock the open planned swaps that hold their copies before they lock the copies, as swap in does. See Copy delete and Revert.
- `create_planned_swaps({ request: { idempotency_key, planned_swaps } })` accepts only an AI client's token. It saves 1 to 10 planned swaps in one transaction, all or none, and returns each item's `ref`, `planned_swap_id`, and `warnings`, with `replayed`. The idempotency key follows Per-user data.
  - Each item has a `ref`, `deck_id`, `expected_deck_revision`, `incoming` as `{ copy_id, as_commander }` or `{ basic_land_oracle_id }`, an optional `outgoing` as `{ copy_id }` or `{ basic_land_oracle_id }`, and a `reason` of 20 to 600 characters. `as_commander` defaults to true when the outgoing copy is a commander.
  - A basic land is a basic land card's `oracle_id`. An incoming basic land means one more of it, and the planned swap holds no copy. An outgoing basic land means one fewer of it. `incoming_copy_id` is null for an incoming basic land, and `outgoing_copy_id` is null for an outgoing one.
  - It locks the decks, then the incoming copies, in ID order.
  - It copies the AI client's name from Supabase Auth's client record.
  - Refusals save nothing. `invalid_argument` covers a bad field, two items with one `ref` or one copy, two revisions for one deck, and two items with the same deck, incoming card, `as_commander`, and outgoing card. It also covers a `basic_land_oracle_id` that is not a basic land card, `as_commander` with an incoming basic land, and the same basic land in and out. `not_found` covers a deck or copy that is not the user's. `stale_revision` has `pointer`, `expected`, and `current` in its details. `outgoing_not_in_deck` is an outgoing copy that is not in the deck, or an outgoing basic land that the deck has none of. `copy_not_free` is an incoming copy that is in a deck or held. `protected_copy` is a protected incoming copy. `duplicate_open` is an open planned swap or buylist card in the deck with the same incoming card, `as_commander`, and outgoing card, and its details name its `planned_swap_id` or `buylist_card_id`.
  - Warnings are saved with the item. `would_break_validity` carries the effect, judged the same way as the Add to deck drawer. The effect counts one more of an incoming basic land and one fewer of an outgoing one. `replaces_commander` comes when the outgoing copy is a commander. `rules_stale` comes when the deck's estimated bracket is stale.
- `list_planned_swaps({ query: { deck_id, status, order, cursor, limit } })` reads under row-level security. Every field is optional.
  - `order` is `newest_first`, the default, or `oldest_first`. Recent asks for `status: open` and `oldest_first`, 50 at a time, and follows `next_cursor` until it is null. The MCP tool lists newest first in every state.
  - A page has 20 planned swaps, or `limit`, from 1 to 50. The cursor works as in `list_deck_changes`, and it belongs to one deck, status, and order.
  - Each item has `planned_swap_id`, `deck_id`, `deck_name`, `commander_art_crop_uri`, `incoming` and `outgoing` lines, `as_commander`, `reason`, `status`, `close_note`, `client_name`, `created_at`, `status_changed_at`, and `effect`. A copy line has `kind` `copy`, `copy_id`, the card's `name`, the `image_uris` of the copy's printing, `type_line`, `set`, `collector_number`, `finish`, and `condition`. A deleted copy keeps its card's name and type line, with no image and null printing fields. A basic land line has `kind` `basic_land`, `oracle_id`, `name`, and `image_uris`, as on `list_deck_changes`. `outgoing` is null when the planned swap takes nothing out.
  - `effect` is the current effect of an open planned swap, or null. It is null for every other status.
- `swap_in_planned_swap({ request: { planned_swap_id } })` refuses an AI client's token. It locks the deck, then the planned swap, then the held copy. In one `swapped_in` deck change, it takes the outgoing copy out and puts the held copy in, as a commander when `as_commander` is true. An incoming basic land adds one more of it, and an outgoing basic land takes one fewer of it, with a basic land line for each. The deck change keeps the reason and the client name. The planned swap becomes `swapped_in`. It returns `deck_id` and the new `revision`.
  - A planned swap that is not open is refused with `not_open` on `planned_swap_id`. Another user's planned swap is refused with `not_found`.
  - A commander swap into a deck that keeps two other commanders is refused with `commander_limit`.
  - A concurrent add of the held copy to another deck waits for the copy lock, then gets `copy_not_free`.
- `swap_in_planned_swaps({ request: { deck_id, planned_swap_ids } })` refuses an AI client's token. It swaps in 1 to 100 open planned swaps of one deck in one transaction. It locks the deck once, then the planned swaps, then their held copies. It swaps them in oldest first, by `created_at` and then ID, with the same code as `swap_in_planned_swap`. Each one makes its own `swapped_in` deck change with its reason and client name, and `private.finish_deck_change` runs after each one. It returns `deck_id`, the new `revision`, `swapped_in` (the IDs in the order they went in), and `closed`.
  - A planned swap that an earlier one in the call closed, because its outgoing card left the deck, is skipped. It stays closed with `outgoing_left_deck`, and its ID is in `closed`.
  - An ID that is not an open planned swap of the caller in that deck is refused with `not_found` or `not_open` on its field, such as `planned_swap_ids[1]`. A repeated ID is refused with `invalid_argument`.
  - When a swap in fails, nothing changes. A swap in that would make a third commander is refused with `commander_limit` on the field of that planned swap.
  - Each planned swap makes its own deck change, so reverting the first one undoes the whole call.
- `close_planned_swap({ request: { planned_swap_id } })` refuses an AI client's token. It locks the deck, then the planned swap. It closes an open planned swap with the close note `closed_by_user`, and the held copy becomes free. It returns `id` and `changed`.
  - Closing a closed planned swap changes nothing and returns `changed: false`. A planned swap in any other state is refused with `not_open`. Another user's planned swap is refused with `not_found`.
- `mcp_close_planned_swap({ request: { planned_swap_id } })` accepts only an AI client's token. It works the same way, with the close note `closed_by_ai_client`. Every planned swap comes from an AI client, so an AI client can close any open planned swap of the user. The `mcp_` prefix keeps it apart from the app's function.
- Every deck change ends with `private.finish_deck_change`. It closes each open planned swap and buylist card of the deck whose outgoing copy is no longer in the deck, or whose deck has none left of its outgoing basic land card, with the close note `outgoing_left_deck`. Then it saves the deck evaluation. So a removal, a revert, a swap in, a Bought, and a copy delete close the planned swaps and buylist cards that would take that copy out. Setting a basic land to 0 closes those that would take one out. Two open items with the same outgoing card both stay open until the card leaves the deck.
- Recent lists the open planned swaps and open buylist cards together, oldest first, with their deck tag, change lines, effect chip, reason, AI client name and time, **Swap in** or **Bought**, and **Close**. A basic land change line shows "+1" or "−1", as on History. The deck tag opens the deck on Planned. The All, Planned swaps, and Buylist chips show one kind at a time. They hide while Recent is empty. Recent reloads when the tab gains focus. **Swap in** and **Close** act at once. A swap in that fails shows "Could not swap in this card" with "Check your connection.". A close that fails shows "Could not close this planned swap" or "Could not close this buylist card" with "Check your connection.". An item that changed elsewhere reloads Recent.

### Buylist cards

A buylist card is an AI client's plan for a card that the user has to buy for a deck, optionally in place of a deck card. It names a card, not a copy, and it is never a basic land. Its outgoing card can be a basic land, as for a planned swap. Only AI clients add buylist cards, through the MCP connection. `supabase/buylist.ts` has the shared types.

- `buylist_cards` holds each buylist card with its user, its deck, the card (`incoming_oracle_id`), `as_commander`, the optional outgoing copy and its card or outgoing basic land card, the `reason`, the `status`, the `close_note`, the AI client's `client_id` and `client_name`, `created_at`, and `status_changed_at`. The status is `open`, `bought`, or `closed`. Only an open buylist card can change. It stores no card printing. Deleting a deck deletes its buylist cards.
- `create_buylist_cards({ request: { idempotency_key, buylist_cards } })` accepts only an AI client's token. It works like `create_planned_swaps`, with `incoming` as `{ oracle_id, as_commander }`. `outgoing` is `{ copy_id }` or `{ basic_land_oracle_id }`, as there. It returns each item's `ref`, `buylist_card_id`, and `warnings`, with `replayed`. It locks the decks in ID order.
  - Its refusals are those of `create_planned_swaps`, less `copy_not_free` and `protected_copy`, plus two. `invalid_card` on `incoming.oracle_id` is a card that is not in the card catalog, or a basic land card. `free_copy_exists` is a card with a free copy that is not protected. Its details have `pointer` and `copy_ids`, the free copies, so the AI can plan a swap instead.
  - Its warnings are those of `create_planned_swaps`, plus two. `protected_only` comes when every free copy of the card is protected. `in_other_decks` comes when no copy is free and copies sit in other decks. It lists each of those decks with `deck_id`, `name`, and `priority`, by deck priority, then by name.
  - The effect puts the card's default printing into the deck. `private.default_printing_id` picks it: a printing that is not absent, with an image, in English, with a nonfoil finish, the newest, then by set and collector number. The basic land images use the same rule.
- `list_buylist({ query: { deck_id, status, order, cursor, limit } })` reads like `list_planned_swaps`. Its cursor does not work for `list_planned_swaps`. Each item has `buylist_card_id`, `deck_id`, `deck_name`, `commander_art_crop_uri`, `incoming`, `outgoing`, `as_commander`, `reason`, `status`, `close_note`, `client_name`, `created_at`, `status_changed_at`, and `effect`. The `incoming` card line has `kind` `card`, `oracle_id`, `name`, the `image_uris` of the card's default printing, and `type_line`. `outgoing` is a copy line or a basic land line, as in `list_planned_swaps`.
- `list_free_copies({ query: { oracle_id } })` reads under row-level security. It returns `items`, the free copies of the card across printings, each in the shape of a collection copy row with no `deck` and no `held_for`. Protected copies are in it. The Bought page sheet reads it.
- `mark_buylist_card_bought({ request: { buylist_card_id, copy_id, unprotect } })` refuses an AI client's token. It locks the deck, then the buylist card, then the copy. In one `bought` deck change, it takes the outgoing copy out, or one fewer of the outgoing basic land, and puts the copy in, as a commander when `as_commander` is true. The deck change keeps the reason and the client name. The buylist card becomes `bought`. It returns `deck_id` and the new `revision`.
  - The copy must be a free copy of the buylist card's card. A copy of another card is refused with `invalid_argument` on `copy_id`. A copy in a deck or held is refused with `copy_not_free`. A protected copy is refused with `copy_protected` unless `unprotect` is true. Then it unprotects the copy in the same transaction. Another user's copy is refused with `not_found` on `copy_id`.
  - A buylist card that is not open is refused with `not_open` on `buylist_card_id`. Another user's buylist card is refused with `not_found` on `buylist_card_id`. A commander that would make a third commander is refused with `commander_limit`.
  - Swap in and Bought share `private.swap_into_deck`, which writes the deck change, its copy lines, and its basic land lines. It checks the commander limit with `private.commander_count_under_limit`, as `set_deck_commander` does. Bought checks the copy with `private.take_free_copy`, as `add_deck_card` does.
- `close_buylist_card` and `mcp_close_buylist_card` take `{ buylist_card_id }`. They work like the planned swap closes, with the close notes `closed_by_user` and `closed_by_ai_client`.
- **Bought** on a Recent item opens the Bought page sheet. It lists the free copies of the card, each with its printing, finish, and condition. A protected copy shows the warning line "<card> is protected. Picking it unprotects it.". Picking a copy marks the buylist card bought with it, unprotects a protected copy, and closes the sheet. With no free copy, the sheet shows "No copies found" with "Scan copies into your collection first.". A Bought that fails shows "Could not mark this card bought" with "Check your connection.", and the sheet stays. A copy that is no longer free reloads the sheet. A buylist card that changed elsewhere closes the sheet, and Recent reloads.

### Needs you

The Needs you items are the open planned swaps and open buylist cards. Recent lists them across all decks, and the deck screen's Planned tab lists those of one deck. Both read every page of `list_planned_swaps` and `list_buylist`, so they list every item.

- `private.needs_you_items` is a view with `security_invoker` of the open planned swaps and open buylist cards, with their user and deck. `get_needs_you_counts` and `list_decks` count from it.
- `supabase.rpc('get_needs_you_counts')` reads under row-level security. It returns `total`, the number of the caller's Needs you items, and `decks`, with `deck_id` and `count` for each deck that has one. It takes an optional `query`, an empty object. A query with a field is refused with `invalid_argument` on that field.
- The app reads the counts after sign-in, when it comes back to the foreground, and each time Recent or the deck screen reads its items. The Recent tab badge shows `total`. The Planned tab badge shows the deck's count. The commander gallery card shows `needs_you_count` from `list_decks`. A count of 0 shows no badge.
- The deck screen's segmented control is **Cards**, **Planned**, and **History**. Planned lists the deck's Needs you items oldest first, with the same actions as Recent and no deck tag. With none, it shows "Nothing planned yet". With two or more open planned swaps, **Swap in all** sits above the list. After a confirmation, it sends the IDs of the planned swaps that Planned shows to `swap_in_planned_swaps`, then reloads Planned and the Needs you counts. Buylist cards stay, because each one needs **Bought** with a copy. The deck tag of a Recent item opens the deck on Planned. Decks and the copy page open it on Cards.
- A deck card that an open planned swap takes out shows "Planned out" on Cards.

### Deck evaluations

mtgscan judges each deck against the Commander rules and stores the result as one deck evaluation per deck. `docs/adr/0006-store-deck-evaluations-and-recompute-them-after-rules-data-imports.md` says why. `supabase/decks.ts` has the shared types.

- `deck_evaluations` holds one row per deck that has a card, with the user ID. Deleting a deck deletes its row. mtgscan keeps only the current deck evaluation, with no history.
- A row has `validity` (`valid`, `invalid`, or `cannot_be_determined`), `violations` in a fixed order, `undetermined`, the checks that could not run with their cards and reason, `chosen_color` (`W`, `U`, `B`, `R`, `G`, or null), `estimated_bracket` (2, 3, or 4), `bracket_signals`, `missing_signal_count`, `revision`, the deck revision it judged, and `judged_at`. `catalog_at`, `oracle_tags_at`, and `commander_spellbook_at` are the snapshot times of the card catalog, the Oracle tags, and Commander Spellbook that it read. Each is null before the first import of its source.
- One private function, `private.judge_deck`, judges a deck and writes nothing. Its input is the deck's copies, each with its card printing and `commander` or `main`, and each basic land card with its count. Its output is a deck evaluation without the deck revision.
- The validity is `invalid` with any violation, `cannot_be_determined` with no violation and at least one check that could not run, and `valid` otherwise.
- Each violation has `rule`, `citation` or null, `message`, `hint` or null, and `cards`. A card is a copy with `kind` `copy`, `copy_id`, `name`, and `image_uris`, or a basic land card with `kind` `basic_land`, `oracle_id`, `name`, and `image_uris`.
- The violations so far, in their order:

  | Rule | Checks | Citation | Message and hint |
  | --- | --- | --- | --- |
  | `no_commander` | The deck has no commander. The other checks still run. | CR 903.3 | "This deck has no commander." |
  | `commander_eligibility` | A commander cannot be your commander. Legendary creatures can be. Legendary Vehicles and Spacecraft with power and toughness can be. Cards that say they can be your commander can be. A Background can be beside a commander with choose a Background. | CR 903.3 | "Lightning Bolt cannot be your commander.", one sentence per commander |
  | `partner` | Two commanders are not a pair. Two commanders with the same partner ability and the same text are a pair. So are two commanders whose partner-with names name each other. So are a commander with choose a Background and a Background. So are a commander with Doctor's companion and a Time Lord Doctor. | CR 702.124 | "Krenko, Mob Boss and Tymna the Weaver cannot be commanders together.", with the names in name order |
  | `deck_size` | The deck does not have exactly 100 cards, commanders and basic lands included. It names no cards. | CR 903.5a | "87 of 100 cards." with "Add 13 cards.", or "101 of 100 cards." with "Remove 1 card." |
  | `singleton` | A card has more copies than its copy limit. Copies of every card printing and both roles count together. Basic lands are exempt. | CR 903.5b | "2 copies of Sol Ring." with "Remove 1 Sol Ring.", one sentence each per card, in name order |
  | `color_identity` | A card's color identity, or the color of mana of a basic land type in its type line (CR 903.5d), is outside the commanders' color identity with the chosen color. Basic lands are checked too. It names each such card. Skipped with no commander. | CR 903.5c | "2 cards are outside Green and Blue.", with the colors in the order that Magic uses for that color combination, or "outside colorless." for a colorless color identity. The number counts every basic land, such as 2 for two Mountains. |
  | `banned` | A card's Commander legality is banned. | none | "Dockside Extortionist is banned in Commander.", one sentence per card |
  | `not_legal` | A card's Commander legality is not legal, such as an Un-card. | none | "Mine Security is not legal in Commander.", one sentence per card |

- Each check that could not run has `rule`, `reason`, and its cards. They come in the violation order:
  - `commander_eligibility`, "No rules data for Krenko, Mob Boss.", for a commander that the card catalog no longer lists. One check per commander.
  - `partner`, only in a deck with two commanders that are not a pair by what mtgscan can read. "No rules data for Krenko, Mob Boss." is for a commander that the card catalog no longer lists. "mtgscan cannot read the partner ability of Tymna the Weaver." is for a commander with an unknown partner ability, choose a Background, or Doctor's companion. A Partner with line that mtgscan does not recognize makes the partner ability unknown. One check per commander.
  - `singleton`, "mtgscan cannot read the copy limit of Tolabow, Loch Rascal.", for a second copy of a card with an unknown copy limit. One copy of that card makes nothing undetermined.
  - `color_identity`, "No rules data for Mine Security.", for each card that the card catalog no longer lists. With a commander that has no rules data, it names no card outside the color identity. "mtgscan cannot read whether Tolabow, Loch Rascal chooses a color." is for a commander whose `commander_chooses_a_color` is unknown, only when every card outside the color identity shares one color. It has the commander and those cards.
  - `legality`, "No rules data for Mine Security.", one sentence per card, for cards that the card catalog no longer lists or whose Commander legality is unknown. A banned or not legal card still makes the deck invalid.
- Singleton reads the card's copy limit from `copy_limit` and `copy_limit_number`.
- A `color_identity` violation also has `colors`: the colors of its cards outside the commanders' color identity with the chosen color, in WUBRG order, such as `["R"]`.
- The chosen color: when a commander chooses a color and every card outside the rest of the commanders' color identity shares one color, that color is the chosen color. With no such card there is none. With cards outside it in two or more colors there is none, and those cards break color identity.
- A migration that changes the judge recomputes the deck evaluation of every deck that has a card.
- The judge also gives the estimated bracket from four bracket signals. Each signal has `kind`, `source` (`official` or `heuristic`), `count`, `lowest_bracket`, and `cards`. The estimated bracket is the highest lowest bracket, and 2 with no signal. It is never cannot be determined. The signals, in their order:

  | Kind | Source | Lowest bracket |
  | --- | --- | --- |
  | `game_changers` | official, the Game Changer flag | 0 cards give 2, 1 to 3 give 3, and 4 or more give 4. A card with a null flag is not counted and adds to `missing_signal_count`. |
  | `mass_land_denial` | heuristic, Oracle tag `mass-land-denial` | Any card gives 4. |
  | `two_card_combo` | heuristic, Commander Spellbook | A combo with both cards in the deck. Ruthless gives 4. Spicy and powerful give 3. Core, oddball, exhibition, and banned give no signal. |
  | `extra_turns` | heuristic, Oracle tag `extra-turn` | 1 to 3 cards give 2, and 4 or more give 4. |

- A tag counts with its descendant tags, as in tag search, and a disabled tag never counts. `count` is the number of cards, or of combos for `two_card_combo`. A `two_card_combo` signal adds `combos`: each combo with its two `cards`, `produced_features`, and `bracket_tag`. A signal with a count of 0 is left out, except `game_changers`.
- `add_deck_card`, `remove_deck_card`, `set_deck_commander`, `change_basic_land`, `revert_deck_changes`, and `delete_copy` for a copy in a deck save the deck evaluation in the same transaction, after they change the cards, with the new deck revision. A refused request or one that makes no deck change saves nothing. Creating, renaming, and deleting a deck, and changing its deck priority, save nothing.
- The deck change that adds a deck's first card creates its deck evaluation, and the one that removes its last card deletes it. An empty deck has none.
- `private.judge_deck` reads only rules data, never user data, so it runs with its owner's rights. The previews run with the caller's rights and call it, while the import snapshots stay closed to signed-in users.
- `recompute_deck_evaluations()` judges every deck that has a card again and saves every deck evaluation in one transaction. It returns the number of decks that have a card. A failure rolls back every deck evaluation.
  - It runs as the `deck_evaluator` role. The role can read decks, deck cards, deck basic lands, copies, the import snapshots, and `disabled_tag_changes`. It judges through `private.judge_deck`, which reads the card catalog and the rules data with its owner's rights. It can write only deck evaluations. Only the secret key can call the function. The import role still cannot read or write user data.
  - It locks each deck as a deck change does. A deck change waits for it, and it waits for a deck change, so a deck evaluation is never overwritten by an older one.
  - The rules data imports and the Oracle tag command run it. Card catalog imports says when.
- A deck evaluation is behind when the `catalog`, `oracle_tags`, or `commander_spellbook` import snapshot is newer than the one it read, or an Oracle tag was disabled or enabled after it was judged. `deck_evaluations_are_behind()` says whether any deck evaluation is behind. Only the secret key can call it. `disabled_tag_changes` keeps the time of each disable and enable.

#### Freshness

`list_decks` and `get_deck` work out `validity_stale` and `bracket_stale` when they run, from the stored snapshot times and `catalog_freshness()`.

- A source is stale when `catalog_freshness()` says so, 7 days after its last successful import, or when the deck evaluation is behind it. A source that was never imported is not stale.
- The validity is stale when the card catalog is stale.
- The estimated bracket is stale when the card catalog, the Oracle tags, or Commander Spellbook is stale. An Oracle tag disabled or enabled after the deck evaluation was judged makes the Oracle tags behind.
- A stale deck evaluation keeps the snapshot times it read. A failed import or recompute never changes or deletes it.
- `private.rules_data_behind` says which sources a deck evaluation is behind. `deck_evaluations_are_behind()` and the reads both use it. It runs with its owner's rights, because the import snapshots and `disabled_tag_changes` stay closed to signed-in users. It reads no user data.

#### Previews

A preview judges a deck as a change would leave it and compares the result with the stored deck evaluation. It writes nothing, and it never blocks the change.

- `supabase.rpc('preview_add_deck_card', { query: { copy_id } })` returns `items`, one per deck of the caller, with `deck_id` and `effect`. It judges each deck with the copy added to its main deck. The Add to deck drawer reads it. A copy that is not the caller's is refused with `not_found` on `copy_id`.
- `supabase.rpc('preview_add_deck_card', { query: { basic_land_oracle_id, count } })` judges each deck with `count` more of the basic land card, 1 to 99. It judges the same way as a planned swap's incoming basic land. A card that is not a basic land card is refused with `invalid_argument` on `basic_land_oracle_id`, and a query with both `copy_id` and `basic_land_oracle_id` on `basic_land_oracle_id`.
- `preview_revert` returns `effect`. It judges the deck as the revert would leave it. The revert page sheet reads it.
- An `effect` is null, or has `kind` and `rules`:
  - `kind` is `would_make_invalid` when the stored validity is `valid` or `cannot_be_determined`, and `adds_violation` when it is `invalid`.
  - `rules` lists each rule with a new violation, in the violation order, such as `{ rule: 'singleton' }`. A `color_identity` rule also has `colors`, the colors outside the color identity.
  - A new violation is a rule that the stored deck evaluation does not break, or a card in a rule that it breaks but not with that card. So `deck_size` counts only when the deck has exactly 100 cards before the change and not after.
  - A deck with no deck evaluation has no effect.
  - A change that leaves a deck empty has no effect.

### Collection search

Signed-in users search their own collection with `supabase.rpc('search_collection', { query })`. It takes the same typed query as catalog search, plus the collection chips and `rows`. `supabase/collection.ts` has the shared types for the query and the result rows. The Collection tab reads its binder grid only through collection search, with `rows: 'copies'`. Its search bar and its Filters drawer turn the typed text and chips into the typed query.

Collection search returns copies only. Basic lands are not copies, so the app adds the basic land tiles itself, after the last page of copies. It reads them with `list_basic_land_cards`, and `matchingBasicLands` in `src/collection/basic-land-matches.ts` picks the ones that the typed query matches. A query with any field but `text`, `names`, and the sort matches none. Otherwise a basic land card matches when its name contains every word of the text and every `names` value, ignoring case.

- Chips match copies. `finishes`, `conditions`, and `languages` take the finish, condition, and language values of copies.
- `sets` and `rarities` match the copy's own card printing. `price_min`, `price_max`, and `sort: 'price'` use the current USD price of that card printing and finish. A bound matches a price equal to it, and goes up to 9999999999.99. The app turns a bound in another currency into USD bounds, as Converted prices says. `sort: 'release_date'` uses the release date of that card printing.
- `is_free` matches free copies. A protected copy can be free. `is_protected` matches the protected flag. The Collection tab's Free filter is `is_free: true` with `is_protected: false`.
- `user_tags` and `user_tags_exclude` take user tag names, matched ignoring case. A copy matches `user_tags` when it has every listed user tag, and `user_tags_exclude` when it has none of them. A name that is not one of the caller's user tags is refused with `invalid_argument` on that list item, such as `user_tags[0]`.
- `is_allocated` true matches copies in a deck, and false matches copies in no deck.
- `deck_ids` and `deck_ids_exclude` take up to 10 of the caller's deck IDs. A copy matches `deck_ids` when it is in one of the listed decks, and `deck_ids_exclude` when it is in none of them. An ID that is not one of the caller's decks is refused with `invalid_argument` on that list item, such as `deck_ids[1]`. The server never matches deck names. The Collection tab turns a typed `deck:` name into the IDs of every deck with exactly that name, ignoring case.
- Collection search also returns cards that are not Commander-legal, and copies whose card printing is marked absent.
- `rows` is `entries` or `copies`, and defaults to `entries`.
  - With `entries`, each row is one collection entry: the matching copies that share a card printing, finish, condition, language, and protected flag. A collection entry has no ID of its own. Each row has the quantity, free quantity, allocated quantity, and held quantity of its matching copies. `limit` is 1 to 50 and defaults to 20.
  - With `copies`, each row is one copy, with its `copy_id`. `limit` is 1 to 120 and defaults to 60. The card printing is `printing_id`, `name`, `set`, `collector_number`, `rarity`, and `image_uris`. The copy gives `finish`, `condition`, `language`, and `protected`. `deck` is the copy's deck with `deck_id` and `name`, or null for a copy in no deck. `held_for` is the deck of the open planned swap that holds the copy, with `deck_id` and `name`, or null.
  - A copy row's `price` is the current USD price of the card printing and finish: `amount` as a decimal string, `currency`, `finish`, and `stale`. `stale` is true when the price snapshot is more than 24 hours old, as `catalog_freshness` says. Condition and language do not change it. `price` is null when `card_prices` has no USD price for that card printing and finish. A price is never taken from another finish.
  - A collection entry row's `price` is the current price of its card printing and finish, in the shape of a copy row's `price`. Its `total` is the entry total: `price` times the row's `quantity`, as a USD decimal string. The app converts both with the shared module. Condition and language do not change either. Both are null when `price` is null.
- `sort` is `relevance` by default, with or without text. Without text, relevance means `added`, so an empty query lists the newest addition first.
- `sort: 'added'` lists the card printing with the newest addition first. Its copies sit next to each other. `sort_order: 'asc'` puts the oldest addition first.
- Rows with the same sort value sort by name, then by card printing ID, then by copy ID.
- Each row counts the copies in the collection availability view. The view has one row for each copy of the caller, with its allocated, held, and free flags. A copy in a deck is allocated. A copy that an open planned swap holds is held. A free copy is neither, so free quantities, the Free filter, the Add to deck drawer, protecting, and the MCP reads leave held copies out.
- Collection search runs with the caller's rights, like catalog search. The views set `security_invoker`, so the read policy on `copies` keeps only the caller's rows.
- Catalog search, `get_cards`, and `list_card_printings` read owned quantities from the same view. A printing list keeps an absent card printing when the caller owns it.
- A first page also has `total_count`, the number of matching rows. Later pages have `total_count: null`. The Collection tab shows it in its count line, such as "6 of 27 copies".
- A first page with text or a filter writes one row to `search_telemetry` with the API `collection`. A read with no text and no filter writes none, so a plain binder read is not recorded. `rows`, `sort`, `sort_order`, `limit`, and `include_oracle_text` are not filters. The secret key cannot call collection search.

### Search release check

`bun run release-check` in `supabase` runs every search in the graded search corpus through catalog search with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It reports whether search is ready to release. It exits with a failure unless every exact-name search ranks its card first, classes 2 to 4 each reach a capped recall@20 of 0.7 or more, and no returned card fails a chip in its query. The Release check workflow runs it by hand against the hosted project. It never runs on pull requests or on a schedule. `supabase/release-check/README.md` describes the corpus, the grading rule, and the report.

### Card catalog imports

`bun run import <command>` in `supabase` runs an import with `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. When `SUPABASE_URL` is not set, it uses `https://<ref>.supabase.co` from `SUPABASE_PROJECT_REF`. Pass `--manifest <path>` to read a fixture instead of the Scryfall bulk data manifest. Pass `--variants <path>` to read a fixture instead of the Commander Spellbook variants file. Pass `--sets <path>` to read a fixture instead of the Scryfall sets list. Pass `--rates <path>` to read a fixture instead of Frankfurter's latest exchange rates.

- `catalog` imports cards and card printings. Each card printing keeps `image_uris`, the Scryfall `normal` image of each face, and `art_crop_uri`, the Scryfall `art_crop` image of its front face or null. It also keeps Scryfall's `booster`, `promo`, and `variation` flags. After the run, even a skipped one, it reads Scryfall's sets list in one request and adds or updates `card_sets`: each set's code, name, `set_type`, `released_at`, and `icon_svg_uri`. A set with no `released_at` in Scryfall keeps null. Some sets use the icon of a parent set, so the app reads the icon from this table, not from a URL pattern. Signed-in users can read `card_sets`. The Weekly import workflow runs it.
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
- `deck-evaluations` runs the recompute when any deck evaluation is behind, and does nothing otherwise.

After a successful `catalog`, `oracle_tags`, or `commander_spellbook` run, the command recomputes every deck evaluation, as Deck evaluations says. A skipped run recomputes nothing. A failed recompute fails the command, and the imported data stays. The next `deck-evaluations` run tries again. `retry-weekly` does not recompute. The Daily import runs `deck-evaluations` after it.

`bun run oracle-tag disable <tag UUID>` stops a bad Oracle tag from matching any search. `bun run oracle-tag enable <tag UUID>` undoes it. The Oracle tag workflow runs the same command by hand. A disabled tag stays disabled after every later tag import. After the change, the command recomputes every deck evaluation. A failed recompute fails the command, and the change stays.

The Daily import workflow runs `prices`, `exchange_rates`, `prune-telemetry`, `retry-weekly`, and `deck-evaluations`. A failed step fails the workflow run, and the later steps still run. Each run records an import run, so the hosted project does not pause. The Import workflow runs one source by hand.

### Per-user data

Every table that holds a user's data follows one pattern:

- Row-level security is on, and the read policy returns only the signed-in user's rows.
- Direct inserts, updates, and deletes are revoked for the `anon` and `authenticated` roles.
- Changes go only through database functions. Each function runs in one transaction and checks the caller's identity.
- Reads run with the caller's rights, so the read policy decides which rows the caller sees. Read functions are `security invoker`, and views over a user's data set `security_invoker`. No read function filters on the caller itself.

The tables with a user's data are `profiles`, `copies`, `collection_additions`, `collection_addition_lines`, `collection_addition_copies`, `user_tags`, `copy_user_tags`, `decks`, `deck_cards`, `deck_basic_lands`, `deck_changes`, `deck_change_lines`, `deck_change_basic_lands`, `deck_evaluations`, `planned_swaps`, and `buylist_cards`. `search_telemetry` departs from the pattern, as Catalog search says. App roles cannot write `search_telemetry`. Searches write their telemetry row through `private.record_search`. It runs with the owner's rights. The `deck_evaluator` role reads every row of `decks`, `deck_cards`, `deck_basic_lands`, and `copies`, and writes every row of `deck_evaluations`, because the recompute judges the decks of every user. Only the secret key can call the recompute. Deck evaluations says more.

The `anon` role cannot use the `private` schema. `authenticated` and `service_role` can use it. Every `private` function is closed by default. Functions that `postgres` creates have no `execute` grant for `PUBLIC`, so a new `private` function starts closed. A migration grants `execute` on a helper only to the roles whose functions call it.

Every app write function refuses an AI client's token. Each one calls `private.refuse_mcp_token()` right after `private.caller_user_id()`. The helper raises `insufficient_privilege` with "AI clients cannot change decks or the collection." when the token has a `client_id` claim. Supabase Auth's OAuth server puts that claim on every AI client's token. The app's sign-in never does, so the refusal does not affect the app. Read functions and previews do not call the helper. So an AI client's token can read through the Data API the same data that the MCP connection returns. `docs/adr/0007-refuse-mcp-tokens-by-client-id.md` says why.

`public.begin_mcp_call` and the AI writes `public.create_planned_swaps`, `public.create_buylist_cards`, `public.mcp_close_planned_swap`, and `public.mcp_close_buylist_card` do the reverse. They require an AI client's token through `private.caller_ai_client()`, which raises `insufficient_privilege` with "Only an AI client can call this function." for any other token. `supabase/tests/ai-client-tokens.test.ts` leaves them out of its release gate by name, in the group `requiresAnAiClientsToken`, and checks that each AI write refuses the app's token.

`mcp_call_counts` departs from the pattern too. It has no read policy, because nothing reads it. Only `begin_mcp_call` writes it.

`ai_write_requests` departs from the pattern in the same way. It is the store of idempotency keys for every AI write that takes an `idempotency_key`. Row-level security is on with no policies, and no app role can read or write it, because nothing reads it through the Data API. Only `private.replayed_ai_write` and `private.save_ai_write` read and write it. An AI write calls `private.replayed_ai_write` before it saves anything, and `private.save_ai_write` with its result, in the same transaction:

- Idempotency keys are per user.
- Each call saves its key with its input and result for 24 hours.
- A repeat with the same key and input returns the first result with `replayed: true` and saves nothing.
- A repeat with the same key and other input is refused with `idempotency_conflict`.
- Each call deletes the keys that are older than 24 hours.

Signing up creates the user's profile through a trigger on `auth.users`.

### MCP connection

AI clients reach mtgscan through the MCP server, the Edge Function in `supabase/functions/mcp`. Its MCP server URL is `<Supabase URL>/functions/v1/mcp`. On the hosted project, it is `https://gjzecqwkruixdousbual.supabase.co/functions/v1/mcp`. The AI clients list in the settings drawer shows it. The function serves MCP over Streamable HTTP with `@modelcontextprotocol/server` 2.3.1. It answers protocol 2026-07-28, and the 2025 versions through the SDK's stateless fallback. It keeps no session state: each request gets a new server. The user allows each AI client on the consent page, as Consent page says. The [MCP pre-flight](#mcp-pre-flight) checks the whole chain on the hosted project.

#### MCP server URL

- Supabase Auth's OAuth server signs AI clients in, with dynamic client registration. `supabase/config.toml` turns both on for the local stack.
- The access token hook `public.set_mcp_audience` sets `aud` to `["authenticated", "<MCP server URL>"]` for a token with a `client_id`. It makes the URL from the token's `iss` by replacing `/auth/v1` with `/functions/v1/mcp`. It leaves the app's tokens unchanged. Only `supabase_auth_admin` can call it.
- The function reads the MCP server URL from `MCP_SERVER_URL`. It uses it for the protected resource metadata and the audience check. It makes the issuer from it by replacing `/functions/v1/mcp` with `/auth/v1`. `supabase/config.toml` sets it for the local stack. The deploy workflow sets it on the hosted project from the project ref.
- So the hook and the function both derive the URL from the project URL. If they ever disagree, every call fails with 401. The HTTP tests catch it.

#### Token checks

Each request goes through these steps:

1. A body over 64 KB gets 413.
2. `@supabase/server` checks the JWT against the project's JWKS, with `exp`, `iss`, and the MCP audience. The token must have a `client_id`. A failure gets 401 with `WWW-Authenticate: Bearer resource_metadata="<MCP server URL>/oauth-protected-resource"`. That URL serves the protected resource metadata.
3. `public.begin_mcp_call(tool)` runs with the user's own token. It refuses a token with no `client_id`, and a token whose `session_id` has no live session. Revoking an AI client deletes its sessions, so its next call gets 401.
4. The tool's Postgres function runs with the user's own token under row-level security. The function never uses the secret key.

An AI client's token also works on the Data API. Every app write function refuses it, as Per-user data says, so an AI client cannot change a deck, a copy, or a user tag. `docs/adr/0007-refuse-mcp-tokens-by-client-id.md` says why.

#### Tools

The tools come in this order: the read tools, then the write tools. Every read tool has `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false`. The write tools have `readOnlyHint: false` and the same other three.

| Tool | Postgres function |
| --- | --- |
| `search_catalog` | `search_catalog` |
| `search_collection` | `search_collection`, with collection entries or copies |
| `search_oracle_tags` | `search_oracle_tags` |
| `get_cards` | `get_cards`, up to 20 IDs |
| `list_card_printings` | `list_card_printings` |
| `list_user_tags` | `list_user_tags` |
| `get_collection_summary` | `get_collection_total` |
| `list_decks` | `list_decks` |
| `get_deck` | `get_deck` |
| `list_deck_changes` | `list_deck_changes` |
| `list_planned_swaps` | `list_planned_swaps`, newest first in every state |
| `list_buylist` | `list_buylist`, newest first in every state |
| `create_planned_swaps` | `create_planned_swaps`, 1 to 10 planned swaps |
| `create_buylist_cards` | `create_buylist_cards`, 1 to 10 buylist cards |
| `close_planned_swap` | `mcp_close_planned_swap` |
| `close_buylist_card` | `mcp_close_buylist_card` |

- `supabase/functions/mcp/tools.ts` lists the tools. Each one has all four annotations, an input schema with `additionalProperties: false`, and an output schema that also allows a problem details object.
- `tools.ts` writes the schemas with zod. They follow the types in `supabase/search.ts`, `supabase/collection.ts`, and `supabase/decks.ts`, less the fields that the tool leaves out. The function imports nothing from outside `supabase/functions`, so the schemas copy those types by hand. Every object in an output schema has `additionalProperties: false`. The official MCP client checks each result against it in the HTTP tests, so a change to the result's shape fails them.
- A call to a tool that does not exist gets `invalid-argument` with the pointer `/params/name`. It is not counted against the rate limit.
- A read tool sends its arguments to its Postgres function as `query`, and a write tool as `request`. The tool's `readOnlyHint` says which. Postgres checks the arguments, as it does for the app.
- `list_user_tags`, `get_collection_summary`, and `list_decks` take an empty query.
- No tool takes a currency. Prices are USD. The description of each tool that returns prices says so: `search_catalog`, `search_collection`, `get_cards`, `get_collection_summary`, and `get_deck`.
- The description of `search_catalog` says that it returns only Commander-legal cards and has no fuzzy match. The descriptions of `list_decks` and `get_deck` say that the estimated bracket is an estimate and that heuristic signals are not official. The `list_decks` description says that `needs_you_count` counts the deck's open planned swaps and buylist cards, and the `get_deck` description says that an open planned swap takes out a `planned_out` deck card.
- The description of each write tool ends with the declined-write sentence: if the user declines the call, the AI does not call it again, tells the user that nothing was saved, and asks what they want to change.
- The server instructions say that a deck is the cards in the user's deck box now, and that the AI cannot change a deck or the collection. They tell the AI to plan swaps with free copies that the user owns, to add cards that the user lacks to the buylist, to never hold a protected copy, to follow deck priority, and to recommend a move between decks in the chat instead of planning it.
- A result leaves out image URIs and art crop URIs. Each tool can also leave out fields at a named path. `get_deck` leaves out `added_at`, `commander_at`, `condition`, `language`, `rarity`, `collector_number`, and `set` of each deck card.
- A result carries `structuredContent` and one text block: a one-line summary, then the minified JSON. A search with an AI client's token writes its telemetry row with the caller `mcp`.

#### Limits

- Each user can make 120 tool calls a minute. This rate limit is the only limit on the number of calls. `begin_mcp_call` counts tool calls in `mcp_call_counts`, by UTC minute. A request that is not a tool call, such as `tools/list`, is not counted.
- A tool call over the rate limit gets `rate-limited` with `retry_after_seconds`.
- Pages hold 20 rows by default and 50 at most. This holds for `search_catalog`, `search_collection`, `list_card_printings`, `list_deck_changes`, `list_planned_swaps`, and `list_buylist`. The function sends `limit: 20` when the call has none, so copies also come 20 at a time, not 60 as in the app. A `limit` over 50 gets `invalid-argument` on `/limit`. Postgres checks the rest of the query.
- `get_cards` reads up to 20 IDs in one call.
- A request body over 64 KB gets 413 with `request-too-large`.
- Results aim for under 16 KB. A result over 48 KB gets `result-too-large`. Its detail says how to narrow the request, such as a lower `limit` or no `include_oracle_text`.

#### Problems

- A tool problem is a result with `isError: true`. Its `structuredContent` is an RFC 9457 problem details object: `type`, `title`, `detail`, an optional `pointer`, `retryable`, and the members of its type, such as `retry_after_seconds`. The `pointer` is a JSON Pointer to the argument at fault, such as `/deck_id`. The text block is "title: detail", then the minified JSON.
- HTTP 401, 413, and 500 use `application/problem+json` with `status`. The 401 keeps its `WWW-Authenticate` header.
- `type` is `https://mtgscan.reilley.dev/problems/<name>`.
- `supabase/functions/mcp/problems.ts` maps each Postgres error code to its problem type, such as `not_found` to `not-found`. A code with no entry is `internal-error`. The pointer comes from the error's `details`. A field such as `oracle_ids[1]` becomes `/oracle_ids/1`. A JSON object gives the pointer and the other members.

The problem types, each linked to its page:

- [`invalid-argument`](apps/site/problems/invalid-argument.html)
- [`invalid-cursor`](apps/site/problems/invalid-cursor.html)
- [`not-found`](apps/site/problems/not-found.html)
- [`invalid-card`](apps/site/problems/invalid-card.html)
- [`stale-revision`](apps/site/problems/stale-revision.html)
- [`outgoing-not-in-deck`](apps/site/problems/outgoing-not-in-deck.html)
- [`copy-not-free`](apps/site/problems/copy-not-free.html)
- [`protected-copy`](apps/site/problems/protected-copy.html)
- [`duplicate-open`](apps/site/problems/duplicate-open.html)
- [`free-copy-exists`](apps/site/problems/free-copy-exists.html)
- [`not-open`](apps/site/problems/not-open.html)
- [`idempotency-conflict`](apps/site/problems/idempotency-conflict.html)
- [`data-unavailable`](apps/site/problems/data-unavailable.html)
- [`result-too-large`](apps/site/problems/result-too-large.html)
- [`rate-limited`](apps/site/problems/rate-limited.html)
- [`internal-error`](apps/site/problems/internal-error.html)
- [`unauthorized`](apps/site/problems/unauthorized.html)
- [`request-too-large`](apps/site/problems/request-too-large.html)

Each page is served at its `type` URL and says what the problem means and what to do next. `apps/site/test/problem-pages.test.ts` checks that every type in `problems.ts` has its page, and that every page is a type. The site serves each page at `/problems/<name>`, as the site setup under Consent page says.

#### Log line

Each request logs one JSON line with `tool`, `client_id`, `result`, `protocol_version`, and `duration_ms`. `tool` is null for a request that is not a call to a known tool. `result` is `ok` or the name of the problem type. A request that the MCP SDK refuses logs `invalid-argument`, or `internal-error` for a server error. The line has no arguments, results, or tokens.

#### Running and deploying

- `bunx supabase@2.120.0 start` serves the function on the local stack. `bunx supabase@2.120.0 functions serve` serves it with a reload on each change.
- `supabase/functions/mcp/deno.json` pins the function's packages. `bun run typecheck` in `supabase` runs `deno check` on the function.
- The HTTP tests in `supabase/tests/mcp-server.test.ts` get tokens from the local OAuth server, as an AI client does. They read the log lines from the edge runtime container with `docker logs`.
- `.github/workflows/mcp-function.yml` deploys the function on each push to `main` that changes `supabase/functions/**`.

#### MCP pre-flight

The MCP pre-flight, `bun run mcp-preflight` in `supabase`, checks the whole OAuth and MCP chain against a Supabase project, the way an AI client meets it. It is a release gate. The owner runs it on the hosted project before launch and again after each Supabase Auth upgrade, because Supabase's OAuth server is in beta.

The script signs in the test user and connects two AI clients. It approves each one as the consent page does. It prints `PASS` or `FAIL` and a detail line for each check, and it exits with 1 when any check fails. A check that needs an earlier check that failed prints `FAIL` with "Not run". Cleanup runs at the end, even after a failure.

What the checks prove:

- A call with no token gets 401 with `WWW-Authenticate`. The protected resource metadata names the MCP server URL and the issuer.
- The authorization server metadata names the issuer, the registration, authorization, and token endpoints, PKCE with `S256`, and `offline_access`. With `--hosted`, it must answer at the RFC 8414 URL, `<Supabase URL>/.well-known/oauth-authorization-server/auth/v1`, which ChatGPT may use. The local stack answers only at `<Supabase URL>/auth/v1/.well-known/openid-configuration`, so without `--hosted`, the check takes the first discovery URL of the MCP client SDK that answers, and prints it.
- The test user signs in with email and password.
- For a public client and for a confidential client, because ChatGPT may register either kind:
  - dynamic client registration works;
  - authorize, with `resource` and the scopes that ChatGPT asks for, sends the user to the consent page (supabase/auth#2820). With `--hosted`, it must be `https://mtgscan.reilley.dev/oauth/consent`;
  - the consent page reads the authorization details with the client name;
  - approval returns a code;
  - the code exchange with PKCE and `resource` issues an access token and a refresh token;
  - refresh issues a new access token;
  - both access tokens have `aud` `["authenticated", "<MCP server URL>"]`, the issuer, and the AI client's `client_id`.
- The Data API reads with an AI client's token and its array `aud`. If this fails, the hook is dropped, and the MCP server refuses tokens without a `client_id` instead, as ADR 0007 says. The audience check in the MCP pre-flight then changes too.
- `create_deck` refuses an AI client's token with `42501`.
- The MCP server serves protocol 2026-07-28 to the official MCP client, and each earlier version that the client SDK supports through `initialize`.
- `tools/list` returns the 16 tools in order, with their annotations.
- `search_catalog` finds Counterspell. The test user then creates a deck named "MCP pre-flight" in the app, and `get_deck` reads it.
- The test user scans a free copy of Counterspell. `create_planned_swaps` makes one planned swap that holds it, and `list_planned_swaps` reads it back with the client name from Supabase Auth's client record. A stale deck revision gets `stale-revision` and saves nothing. A replay with the same idempotency key returns the first result and saves nothing.
- The MCP server refuses the app's token.
- `revokeGrant` ends the AI client's access at once: its next call gets 401, because `begin_mcp_call` finds no live session. If this fails, the AI clients alert must say "within an hour" instead of "at once". Its refresh token is refused too.
- Cleanup deletes the deck with its planned swaps, the copy, and the AI clients, and checks that no deck, planned swap, copy, or AI client is left.

On the hosted project, the owner runs it from the main checkout. `.env.hosted` gives `SUPABASE_PROJECT_REF` and `SUPABASE_SECRET_KEY`, and `test-app.env` gives the hosted test user password. The script builds the hosted URL, `https://<ref>.supabase.co`, from the project ref. The script uses the secret key only in cleanup, to delete the AI clients and to check that nothing is left. The publishable key is in the Supabase dashboard, under API Keys. The AI client's Data API calls send it, as an AI client would. The hosted test user must exist, as Test app on the iPhone says. The owner posts the output on the release ticket.

```bash
cd supabase
SUPABASE_PUBLISHABLE_KEY=<hosted publishable key> \
bun --env-file=.env.hosted --env-file=$HOME/.config/mtgscan/test-app.env run mcp-preflight --hosted
```

Without `--hosted`, the script runs only on the local stack, with the local default password of the test user. With `--hosted`, it uses `SUPABASE_URL` if it is set, or else `https://<ref>.supabase.co` from `SUPABASE_PROJECT_REF`. It refuses when neither is set, and it refuses the local stack. It reads the password from `EXPO_PUBLIC_TEST_USER_PASSWORD` and refuses a missing password and the local default password. To run it on the local stack, import the card catalog fixture and seed the test user first, as `docs/agents/local-development.md` (Test sign-in) says:

```bash
cd supabase
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_PUBLISHABLE_KEY=$(bunx supabase@2.120.0 status -o json | jq -r .PUBLISHABLE_KEY)
export SUPABASE_SECRET_KEY=$(bunx supabase@2.120.0 status -o json | jq -r .SECRET_KEY)
bun run test-user
bun run mcp-preflight
```

`supabase/tests/mcp-preflight.test.ts` runs the MCP pre-flight on the local stack. `supabase/mcp-connection.ts` holds the OAuth steps, the MCP client, the tool names and their annotations, and the refusal of the app write functions. The HTTP tests and the MCP pre-flight both use it.

#### Consent page

Supabase Auth's OAuth server sends the user to the consent page at `https://mtgscan.reilley.dev/oauth/consent?authorization_id=<id>`. There the user signs in and allows or denies the AI client. `DESIGN.md` (Consent page) describes what it shows.

- `apps/site/oauth/consent/` holds the page: `index.html`, `consent.css`, and TypeScript with `supabase-js`. `consent-page.ts` holds the page logic, and `main.ts` starts it with the PKCE flow.
- `supabase-project.ts` holds the hosted Supabase URL and the publishable key. Both are public, and the app ships them too. The `/oauth/*` rule in `apps/site/_headers` names the same URL, and a test checks that they match.
- With no session, **Continue with Apple** and **Continue with Google** call `signInWithOAuth` with their provider and a redirect back to the consent page and its `authorization_id`. With a session, the page calls `getAuthorizationDetails`. **Allow** calls `approveAuthorization`, and **Deny** calls `denyAuthorization`. Each follows the redirect that Supabase returns. An AI client that the user already allowed goes straight back to that redirect. **Switch account** signs out of this browser only.
- When one of those calls fails:
  - an authorization that Supabase cannot find, or that is no longer pending, shows the expired link;
  - a session that Supabase rejects signs out of this browser and shows the sign-in buttons;
  - any other failure shows "Could not reach mtgscan." with **Try again**, which repeats the call.
- A sign-in that cannot start shows "Could not start the sign-in. Try again." under the buttons.
- `bun run --filter @mtgscan/site build` bundles the page into `apps/site/oauth/consent/consent.js`. Git ignores the built file.
- `bun run --filter @mtgscan/site test` runs the page tests in Bun with happy-dom and a fake Supabase client.

The site is a Cloudflare Worker with static assets, set up in `wrangler.jsonc`:

- Cloudflare Workers Builds deploys the site on each push to `main`. It installs the workspace and runs `wrangler deploy`.
- The `build` command runs the page build, so `wrangler deploy` and `wrangler dev` build the page first.
- The Workers Builds build variable `BUN_VERSION` is `1.4.2`, the Bun version in `package.json`. The build image has an older Bun by default.
- `apps/site/.assetsignore` keeps the TypeScript, the tests, and the package files out of the upload.
- `html_handling` is `drop-trailing-slash`, so `/oauth/consent` serves the page, and `/problems/not-found` serves `problems/not-found.html`, with no redirect.
- `apps/site/_headers` gives `/oauth/*` its own CSP. It removes the site CSP and allows the page script, plus `connect-src` and `form-action` for the Supabase project, and nothing more. The rest of the site keeps the strict CSP. The problem pages have no script and no inline style, so it fits them, and their test checks that.

Run `bunx wrangler dev` at the repo root to build and serve the site locally. The local page talks to hosted Supabase. Google sign-in on the page uses the Google web client of Supabase's Google provider. Apple sign-in on the page uses the Services ID and the Apple web client secret of Supabase's Apple provider.

#### Apple web client secret

Apple sign-in on the consent page uses the Services ID `dev.reilley.mtgscan.web`. Native Sign in with Apple in the app uses the bundle ID `dev.reilley.mtgscan` and no secret.

- Supabase's Apple provider lists the Services ID first and then the bundle ID in its client IDs: `dev.reilley.mtgscan.web,dev.reilley.mtgscan`. The order matters. Supabase's web flow sends only the first client ID to Apple, so with the bundle ID first, Apple sign-in on the consent page fails. Native sign-in accepts any client ID in the list. `supabase/config.toml` and the Client IDs field in the hosted dashboard use the same order.
- The web flow also needs a client secret. It is a JWT signed with a Sign in with Apple key, a `.p8` file. Apple accepts a client secret for 6 months at most. The `.p8` key stays on the owner's Mac. It never goes in the repo or in GitHub, and Git ignores `*.p8` files.
- `supabase/config.toml` reads the secret from `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`. The local stack does not need it.
- `.github/workflows/apple-web-secret-reminder.yml` runs every Monday. It reads the repository variable `APPLE_WEB_SECRET_EXPIRES_ON`. When that date is less than 14 days away and no issue "Renew the Apple web client secret" is open, it opens one labelled `ready-for-human` that links to the steps below. It fails when the variable is not a date, such as when it is not set.

To renew the secret:

1. On the Mac, run the script in `supabase` with the key's settings. It prints the secret and its expiry date.

   ```bash
   cd supabase
   APPLE_WEB_KEY_PATH=<path to AuthKey_<key ID>.p8> \
   APPLE_WEB_KEY_ID=<key ID> \
   APPLE_TEAM_ID=<team ID> \
   APPLE_WEB_SERVICES_ID=dev.reilley.mtgscan.web \
   bun run apple-web-secret
   ```

   `APPLE_WEB_KEY_PATH` is the path of the `.p8` key, and `APPLE_WEB_KEY_ID` is its key ID. `APPLE_TEAM_ID` is the Apple Developer team ID. `APPLE_WEB_SERVICES_ID` is the Services ID.
2. In the Supabase dashboard, open Authentication, Sign In / Providers, Apple. Paste the secret into **Secret Key (for OAuth)** and save.
3. Set the reminder to the expiry date that the script prints: `gh variable set APPLE_WEB_SECRET_EXPIRES_ON --body <expiry date>`.
4. Start a connection from your AI chat, and sign in with **Continue with Apple** on the consent page. Then close the renewal issue, if one is open.
