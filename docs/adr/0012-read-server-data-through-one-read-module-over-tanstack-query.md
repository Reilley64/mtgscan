# Read server data through one read module over TanStack Query

The app had two shared read modules, a read that runs again on focus and a paged read. Six other modules copied them. Each copy kept its own guard against out-of-date replies, its own rule for a failed read, and its own trigger. So the same failure could look different on two screens, and a fix to the read rules had to land in many places (#412).

The app now reads server data through one read module, `apps/mobile/src/lib/read.tsx`, built on TanStack Query v5 (`@tanstack/react-query`). TanStack Query is plain JavaScript with no native module, so it needs no new EAS build.

- A read takes a database function contract from #410 and a request. The query key is the function name and the request, so a reply for an old key never lands on the new one. The contract also types the reply and the refusal.
- `ReadProvider` in the root layout makes one `QueryClient` with `createQueryClient` each time the app starts. `renderApp` renders the root layout, so each test and each `restartTheApp` gets a fresh client from the same function.
- The client defaults keep the timing the app had before:
  - `retry: false`, so a failed read shows its error state at once.
  - `refetchOnWindowFocus: false`. Only the Needs you counts, the price currency setting, and the training crop uploads setting read again when the app becomes active. One `focusManager` listener on `AppState` tells TanStack Query when the app becomes active.
  - The default `gcTime` of 5 minutes, so a screen that opens again within 5 minutes after it closed shows its last data at once.
- A read on a screen sets `subscribed` from Expo Router's `useIsFocused`. A hidden screen stops listening, so it does not re-render, and an invalidation skips it. When the screen gains focus again, TanStack Query reads again because the data is stale. Reads outside a screen, such as the settings providers and the Needs you counts, do not use `useIsFocused`.
- With `subscribed: false`, the hidden screen is no longer an observer of its query. After `gcTime`, TanStack Query would drop the data of a screen that is still open under another screen or tab, and the screen would show its skeleton and only its first page when it gains focus. So each screen read also holds a second observer with `enabled: false` and `notifyOnChangeProps: []`. It never reads and never re-renders. It keeps the query in the cache while the screen is open.
- What reads again is part of the key or a TanStack Query option: the deck revision goes in the key, and the 24-hour wait before the exchange rates read again is `staleTime`.
- Paged reads use `useInfiniteQuery`. A read again reads as many pages as are shown, from the first page with fresh cursors. An expired cursor reads again from the first page.
- The binder grid is the one exception. Its paged read sets `restartsOnFocus`. When the screen gains focus, it reads only the first page again, and the screen scrolls to the top. Reading every shown page again made the user wait for one read of the whole collection per page (owner decision, 30 October 2026).
- The module does not use `keepPreviousData` for searches, so a new search shows its skeleton. Only two reads keep what they show until the reply for their new key arrives: History, whose key gains the new deck revision, and the Add to deck preview, whose key gains the basic land count. Both kept it before #412.
- The module keeps these parts as app code: the pause in typing, the map from TanStack Query's result to the app's status unions, the refused field, and the read again after an expired cursor.
- Needs you and its counts share the key prefix `needs_you`, so one invalidation reads both again. Recent and the deck screen also observe the counts, so the counts read again each time those screens read their items.
- Signing out clears the cache. This keeps one account's reads from showing to the next account, so most keys hold no user ID. Only the Needs you counts and the training crop uploads setting also put the user ID in their key.

## Consequences

- A screen that opens again while its data is still in the cache shows that data at once and reads again. Before, it showed the skeleton.
- Two reads of the same key share one request and one cache entry, such as the deck screen and the Deck validity drawer.
- History reads again each time the deck screen gains focus, like every screen read. Before, it read again only when the deck revision changed.
- Tests run TanStack Query's notifications in a microtask, because Expo Router's `renderRouter` fakes timers and TanStack Query sends its notifications with `setTimeout`.

## Considered options

- **Keep the app's own read modules and remove the copies.** Rejected. The app would still own the out-of-date guard, the cache, the paged read again, and the focus trigger. TanStack Query does all of them, and its maintainers test them.
- **`gcTime: Infinity`.** Rejected. It also keeps the data of every closed screen and every past search until sign-out.
- **`enabled` from `useIsFocused` in place of `subscribed`.** Rejected. A hidden screen would still re-render on every cache change.
- **Generate the read hooks from the contracts.** Rejected. A contract already gives the key, the reply type, and the refusal type, so no code generator is needed.
