# Coding standards

The review agent checks each diff against these rules. CI already runs the type check, lint, tests, the generated types check, and the PR title check, so this file holds only judgement calls. Each rule points to where its detail lives.

## Domain language

- Use `GLOSSARY.md` terms exactly in code names, SQL names, UI copy, docs, test names, and PR text. A synonym from a term's _Avoid_ list is a finding.
- A domain concept that is not in the glossary is a finding. See `docs/agents/domain.md`.

## Copy and docs

- Write UI copy, docs, and PR text in plain short sentences, with one fact or action per sentence.
- Use sentence case in headings, buttons, and labels.
- Use no em dashes in prose. Card data from Scryfall keeps its own.
- UI copy matches the spec and `DESIGN.md` word for word.
- A PR that changes behavior updates `README.md`, `DESIGN.md`, or `GLOSSARY.md` where they describe it.
- PR issue links follow `docs/agents/issue-tracker.md` (Link a pull request to an issue).

## Code

- Add no code comments. Names, types, and small functions carry the meaning.
- Prefer small modules with one job. Put shared UI in the Atomic Design levels in `apps/mobile/src/components` (see Atomic Design) and sign-in and session logic in `apps/mobile/src/auth`.
- Keep one source of truth for each rule or list, such as one validator, one command map, or one staging table list. A second copy is a finding.
- Remove what nothing uses: exports, helpers, indexes, and dependencies.

## App UI

- Style new UI with NativeWind classes named after the `DESIGN.md` tokens, such as `bg-surface-control`, `text-text-muted`, `text-body-strong`, `rounded-sm`, and `gap-xs`. A new inline style object or `StyleSheet` entry is a finding, unless a native component takes only a style prop, or NativeWind 4 has no class for the style, such as a box shadow or a gradient. Such a value comes from `theme.ts`. A runtime value may stay a style prop, such as a progress width, an `Animated` value, or a `useSafeAreaInsets()` offset. Inside a tab screen, NativeWind's `*-safe` classes read the root insets, not the tab screen's, so the latest-scan overlay keeps the hook.
- Take colors, type, spacing, corners, and sizes from `apps/mobile/src/theme.ts`, which mirrors the `DESIGN.md` tokens. The Tailwind theme comes from it through `apps/mobile/src/tailwind-theme.ts`. `apps/mobile/test/design-tokens.test.ts` checks that the Tailwind theme has every `DESIGN.md` token. A new token goes into `theme.ts` and `DESIGN.md` in the same PR.
- Merge class names with `cn()` from `apps/mobile/src/lib/class-names.ts`. It knows the token names. Plain `twMerge` drops a token class, such as `text-text` beside `text-body-strong`.
- Style a control's state with class variants, not with JavaScript. Set the state as a prop and use the matching variant, instead of a conditional class or style object. NativeWind 4.2.7 on iOS supports these variants. Each was checked in Jest with the compiled classes and on the Simulator (#106):
  - `disabled:` with the `disabled` prop, and `active:` while a `Pressable` is pressed.
  - `aria-selected:`, `aria-checked:`, `aria-disabled:`, and `aria-busy:` with the `aria-selected`, `aria-checked`, `aria-disabled`, and `aria-busy` props. NativeWind does not read `accessibilityState`, so set the `aria-*` prop. `aria-busy:` was checked in Jest and on the Simulator in #112. A busy `Button` is also disabled, so `aria-busy:opacity-100` keeps it at full color over `disabled:opacity-dimmed`.
  - Data attributes through the `dataSet` prop: `[&[data-active]]:` for presence, and `[&[data-active='true']]:` or `data-[active=true]:` for a value. A `data-active` prop does nothing. `dataSet` is not in the React Native types, so prefer an `aria-*` prop when one fits.
  - Parent state: `group` on the control and `group-disabled:`, `group-active:`, `group-aria-selected:`, `group-aria-checked:`, or `group-[[data-active]]:` on the child, as `QuickActionButton` and `Chip` do. `choiceStates` in `control-style.ts` holds the selected and checked colors that `Chip`, `Toggle`, and `ToggleGroup` share. Named groups work too: `group/card` with `group-disabled/card:`. Use a named group when the child comes from another component, as `TileButton` (`group/tile`) and `CardTile` (`group-aria-selected/tile:`) do.
  - When no variant fits, use a `cva` variant.
  - An `expo-image` tint follows a `text-*` color class. `set-icon.tsx` maps the color to `tintColor` with `cssInterop`, so the rarity tint is a `cva` variant.
  - Jest checks `disabled:`, `aria-*:`, data attributes, and their `group` forms with `toHaveStyle`. It cannot hold a press, so check `active:` and `group-active:` on the Simulator.
- Leave out transition and animation classes until they work in Jest. See #102.
- A value outside the tokens needs a reason in `DESIGN.md`, like the Apple and Google button colors.
- Follow the `DESIGN.md` Do's and Don'ts, such as native tabs, page sheets, and no on-screen back buttons outside a drawer.
- Drawers and modals are one level deep (`DESIGN.md`, Sheets). A route or component that opens a drawer, page sheet, alert, or confirmation sheet from inside another drawer or modal is a finding. Push a screen inside the same drawer instead, or show the step inline. Native menus are allowed.
- Give every control an accessibility role and a label that matches its visible text.
- Give every control a touch target of at least 44 by 44 pt. Use `hitSlop` when the control looks smaller, as `Button` and `Chip` do.

## Atomic Design

The app UI follows Brad Frost's Atomic Design (#101). Each level is a folder in `apps/mobile/src/components`:

| Level | Holds | Examples |
| --- | --- | --- |
| Atoms (`atoms`) | The smallest pieces, mostly wrappers of `@rn-primitives` in the React Native Reusables pattern | `Text`, `Button`, `Chip`, `Toggle`, `Switch`, `Surface`, `CardImage` |
| Molecules (`molecules`) | Small groups of atoms with one job | `ListRow`, `SwitchRow`, `ChipGroup`, `ToggleGroup`, `EmptyState` |
| Organisms (`organisms`) | Larger sections | `BinderWall`, `LatestScanChip`, `PrintingPicker`, and later the settings content |
| Templates (`templates`) | Page layouts with no data | `TabScreen`, `DrawerSheet` |
| Pages (`src/app`) | Expo Router routes. They load data and fill templates with organisms. | `settings.tsx`, `(tabs)/(collection)/collection.tsx` |

- Each level imports only from its own level and the levels below it. Pages import from any level. Organisms and features may use feature modules such as `src/scan`. Templates, molecules, and atoms may not. ESLint enforces the direction with `eslint-plugin-boundaries` in `apps/mobile/eslint.config.js`.
- Only atoms use raw controls. ESLint refuses `Pressable`, `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`, `Switch`, and `Button` from `react-native` everywhere else, and `@rn-primitives` outside `src/components`. It also refuses a `style` prop on an element with `onPress`, `onLongPress`, or `onValueChange` outside atoms, and a `className` on a `Text` or `View` with `onPress` or `onLongPress`. Screens compose the primitives and do not restyle raw `Pressable`, `Text`, or `View` for controls.
- Escape hatch for native components: wrap the native control in an atom, which may import it and set its style props. `Switch` is the example: it wraps the iOS switch with the token colors. Use it through `SwitchRow`, which gives it a 44 pt touch target. Do not use an ESLint disable comment.
- `glass-surface.tsx` is the only file that renders `GlassView` and `GlassContainer`, through `GlassSurface` and `GlassGroup`. It calls `cssInterop` for both, so their classes reach the native glass and `rounded-*` sets the glass corners. Glass needs no inline style. The `View` and `Text` lint selectors do not check a `className` on a glass view.
- The raw-control rules cover every file outside `src/components`, with no exception list. Never add one.
- Shared UI is reused, never copied. Block a new control or card-like layout that duplicates an existing primitive or component. When the same UI appears on two screens, extract it to the right level.
- A development build has a primitive catalog at `mtgscan://primitives` that shows every primitive in each state. Add each new primitive and state to it in `src/primitive-catalog`.

## Data and Supabase

- Use full Supabase with no ORM. The app, the tests, and the import jobs use `supabase-js`. They read through the Data API and write by calling database functions. See #29.
- Every table with a user's data follows the per-user data pattern in `README.md`. Its read policy returns only the owner's rows. Direct writes are revoked for `anon` and `authenticated`. Changes go only through database functions that check the caller's identity, one transaction each.
- A table that departs from the pattern says why in `README.md`, as `search_telemetry` does.
- Database functions set `search_path = ''` and use schema-qualified names.
- Functions in `public` revoke `execute` from `public` and from every role that does not call them, then grant it to their callers.
- Reads of per-user data run under row-level security. A read function is `security invoker`, and a view over a user's data sets `security_invoker`. A `security definer` function that filters on `auth.uid()` itself is a finding. See #90.
- Put helper functions in the `private` schema, which the Data API does not expose. Every `private` function is closed by default. Grant `execute` only to the roles whose functions call it.
- Import functions run as `catalog_importer`, write only card catalog, staging, and run tables, and only `service_role` can call them. See #43.
- The card catalog never deletes a card or a card printing. It marks them absent.
- A migration that replaces a function starts from the latest version on `main`, so that parallel changes survive.
- `supabase/database.types.ts` comes only from `bun run types:database`.
- Errors from database functions carry a code, a message, and the field at fault as a JSON path, such as `oracle_ids[1]`. Use `private.raise_search_error` and the `private.checked_*` helpers. See `README.md` (Catalog search).

## Security

- No service role key, secret key, or other service credential goes in the app, in `apps/mobile/.env*`, or in any `EXPO_PUBLIC_` name. Every `EXPO_PUBLIC_` value ships in the app.
- The Supabase secret key lives only in GitHub Actions secrets and local env files.
- The user can edit `user_metadata`. Use it only for display, never for authorization or data access. See PR #54.

## Tests

- Test at the agreed seams from #29 and #43:
  - Database tests in `supabase/tests` call `supabase-js` against local Supabase, as the app does. Only test setup uses the secret key or a direct database owner connection. Per-user data tests use two signed-up users and also check an anonymous caller and refused direct writes.
  - Import tests run the import command with fixture files and never download.
  - App component tests in `apps/mobile/test` render the real Expo Router navigation with `renderApp`. They fake only the Supabase client, the native sign-in modules, the card detector module, the card recognizer module, `expo-file-system`, `expo-haptics`, `isLiquidGlassAvailable()` from `expo-glass-effect`, and the scan sounds in `src/scan/scan-sounds.ts`, in `test/fake-*.ts`. Liquid Glass is off by default, so a test calls `liquidGlassIsAvailable()` to render the glass path. Only `test/native-ui.ts` reads native views. Jest compiles the NativeWind classes in `test/class-styles.ts`, maps CSS files to an empty module, and runs the Reanimated test setup, so class styles show in `toHaveStyle`.
  - Theme tests check the Tailwind theme against `DESIGN.md` and the class merges of `cn()`, with no rendering.
  - Primitive tests in `apps/mobile/test/atoms.test.tsx`, `molecules.test.tsx`, and `drawer-sheet.test.tsx` render one atom, molecule, or template with `render` and check its roles, states, labels, touch target, and token styles.
  - The owner checks on the device what Jest cannot reach, such as real Apple and Google sign-in.
- Test external behavior, such as screen text, roles, returned rows, error codes, and error fields. Leave out internal state, component structure, SQL text, and query plans.
- Name each test as a sentence about the behavior, in glossary terms.
- Each test fails when its behavior breaks. For key rules, the PR evidence shows a mutation check, where the author breaks the code on purpose and the test goes red.
- Every acceptance criterion in the ticket has a test or an owner check.
