# Collection binder module

Date: 2026-10-19

Research notes for the architecture review of 19 October 2026. Candidate 5: a collection binder module behind the Collection screen.

Sources: the review HTML, the explorer notes `mobile.md` (section 4) and `supabase.md`, `GLOSSARY.md`, `CODING_STANDARDS.md`, `docs/adr/`, tickets #410, #411, #412, PR #357, and the code at this worktree. "Binder" is not a glossary term. The glossary uses "binder tile" (`GLOSSARY.md:31`), and the code uses `BinderRead`, so these notes say "binder" for the grid of copies on the Collection screen.

## 1. Is the friction real and as large as the review says?

The friction is real but smaller than the review suggests. It is about 25 lines in one page with one caller. The strongest finding is not the join. It is that the binder applies two different text rules to one search text.

### Claims that hold

- The page joins the reads in its body, not in its JSX. `collection.tsx:161-185` calls `useCollectionSearchState`, `useCollectionCopies`, `useCollectionTotal`, `useDecks`, `useBasicLandCards`, and `matchingBasicLands`, and derives every flag before the JSX starts at line 187.
- Refused chip merge: the search state gives `refusedChipIndex` and `chipIndexOfField` (`use-collection-search.ts:114-116`). The paged read gives `{ status: 'refused', field }` (`use-paged-read.ts:10`, `76-78`). The page merges them at `collection.tsx:169-171`.
- Deck read failure overrides the binder read at `collection.tsx:167`, and line 217 picks `search.reloadDecks` or `reload` for try again.
- Basic lands show only on the last page, with no suggestions, no refused chip, and a search or at least one copy (`collection.tsx:179-180`). Line 182 then filters them with `matchingBasicLands`.
- `basic-land-matches.ts:4` lists the fields that basic lands can match: `text`, `names`, `sort`, `sort_order`.
- Match count, empty state, and floating buttons are derived flags (`collection.tsx:183-185`).
- `commanderArtOf` reads the deck list to find art (`collection.tsx:175-177`). The copy row could carry it. `get_copy` already returns `deck.commander_art_crop_uri` (`20261214090000_keep_deleted_user_tags_and_links.sql:383-389`). The `search_collection` copy row returns only `deck_id` and `name` (`20261223090000_sort_recently_added_copies_by_when_each_was_created.sql:219-224`).
- `0d6c8bb` (#249) and `5d47920` (#357) each changed the page and two or more of these modules together (`git show --stat`).

### Claims to correct

- "Copies the server's text match" is wrong. `matchingBasicLands` is not a copy of the server rule. It is a second, different rule over the same `text` field. PR #357 asked for "those whose names match the text or name: chips". The client rule is a lowercase substring test on each word of the name (`basic-land-matches.ts:10-11`). The server rule is `private.text_search` (`20261019090000_search_the_collection.sql:419-470`): a name key of the whole text, with accents and punctuation stripped (`20261011000000_search_card_catalog.sql:4-23`), or an English full-text match on name, type line, Oracle text, and keywords, or an Oracle tag match. The section on drift below shows where they disagree.
- "Set page could reuse it" is wrong. The set page reads `get_set` and renders set cards rows in the finish view (`set.tsx:14-43`). It shows no copies, no search, and no basic lands. No other screen reads `search_collection`: `use-collection-copies.ts:10` is its only app caller (grep of `src`). The deck Cards tab shows copies and basic land tiles, but from `get_deck` through `deck-groups.ts`. So the module would have one caller.
- `032b085` (#358) changed only `collection.tsx` in `src` (plus `DESIGN.md` and a test). It shows the rules live in the page, not shotgun surgery. `eb2c6ae` (#385) moved the pager into `lib/use-paged-read.ts` for Sets. That is read lifecycle work (#412), not binder work.
- The page imports more than six modules for its rules. It also uses `collection-sort.ts`, `total-labels.ts`, `filter-choices.ts`, `refusedChipMessage`, `useSetIcons`, and, per binder tile, `usePriceCurrency` and `priceLabels` (`collection.tsx:23-41`, `92-93`).

### What the review missed

- `sort` and `sort_order` in `basic-land-matches.ts:4` are dead. The page passes `search.query` (`collection.tsx:182`), not the query with the order (`collection.tsx:165`). `collectionSearchQuery` never sets either field (`collection-search.ts:240-317`). `CODING_STANDARDS.md:24` says to remove what nothing uses.
- Two reads of the deck list. `useCollectionSearch` calls `useDecks(needsDecks)` (`use-collection-search.ts:100`). The page calls `useDecks()` again for commander art (`collection.tsx:175`). Each is its own `useFocusedRead` with its own state. The page reads `list_decks` on every focus, even when no copy is in a deck.
- A failed basic land read is silent. When `list_basic_land_cards` fails, `basicLandsRead` is `failed` and the binder just shows no basic lands, with no try again (`collection.tsx:178-182`, `use-focused-read.ts:18`). A failed page deck read also drops commander art silently.
- Possible stale copies while the deck list loads. When a typed deck chip makes `search.query` null (`use-collection-search.ts:101-114`), `usePagedRead.reload` returns early and keeps the old read (`use-paged-read.ts:57-60`). The page uses `binder.items` without checking `queryKey` (`collection.tsx:172`). So the previous search's copies can show under the new chips until `list_decks` answers. This is from reading the code; I did not run it.
- `add-to-deck.tsx:82-84` reads `list_basic_land_cards` a second time to find one land by its oracle ID. Any change to where the binder gets basic lands leaves this read in place.

### Drift between the two text rules

Both rules run on the same `text`, so the copies and the basic land tiles can disagree on one search. Each example follows from the code cited above:

| Search text | Server rule (copies) | `matchingBasicLands` (tiles) |
| --- | --- | --- |
| `land` | Every card with Land in its type line, by full-text match on the type line | Island and Snow-Covered Island only, because "island" contains "land" |
| `basic` | Cards with basic in their type line or Oracle text, such as every basic land card and Cultivate | None |
| `islands` | Cards with island in their name, type line, or Oracle text, by English stemming | None |
| `snowcovered` | Snow-Covered names, because the name key strips the hyphen | None |
| `"snow covered"` (quoted) | Matches. The name key and `plainto_tsquery` drop the quotes | None. `splitTokens` keeps the quotes (`collection-search.ts:182-184`, `246-251`), so the words are `"snow` and `covered"` |
| `name:snowcovered` | Matches (`20261019090000_search_the_collection.sql:212-213`) | None |

Two rules for one search text is a finding under `CODING_STANDARDS.md:23` ("Keep one source of truth for each rule or list"). The narrow field list (`text` and `names` only) is the product rule from PR #357, so `type:land` showing no basic land tiles is by design, not drift.

### Overlap with filed tickets

- #412 absorbs `useCollectionTotal`, which it names (its own guard, drops errors; `use-collection-total.ts:15-31`), and the typing pause in `use-collection-search.ts:32`. It owns the refused field and keeping what is shown, so it decides the shape of `PagedRead` and `FocusedRead` that a binder module would consume. It does not touch the join at `collection.tsx:164-185`.
- #410 removes the casts in `use-collection-copies.ts:14`, `use-basic-land-cards.ts:13`, `use-decks.ts:13`, and `use-collection-total.ts:24`. After #410 and #412 those read modules shrink to about one line each.
- #411 matters only for option 2 below: the fake would need to return basic lands from `search_collection`. Its current fake answers collection searches from a test callback (`basic-lands.test.tsx:154`, `172`), so it does not simulate either text rule.

So #412 would absorb about one of the six reads and none of the binder rules. The candidate still stands after #412, but it gets smaller.

## 2. What would the deepened module need to own?

### Callers

- `src/app/(tabs)/(collection)/collection.tsx` is the only caller. `filters.tsx` reads the same search state but only its chips (`filters.tsx:7`).

### Rules that would move

1. Build the copies query from the search query and the sort order (`collection.tsx:164-166`).
2. A deck read failure counts as a failed binder, and try again reloads the decks (`collection.tsx:167`, `217`).
3. The refused chip comes from the search state or from the refused field of the read (`collection.tsx:169-171`).
4. Copies show only when loaded, with no suggestions and no refused chip (`collection.tsx:172`).
5. When basic lands show, and which ones (`collection.tsx:179-182`, `basic-land-matches.ts`).
6. The match count: only when searching and not refused (`collection.tsx:183`).
7. Which placeholder shows: refused chip, failed, no match, empty collection, or loading (`collection.tsx:50-83`, `184`, `211-219`). The module would return the kind, and the page would keep the JSX.
8. Commander art for a copy's deck (`collection.tsx:175-177`).
9. Load more, and the loading-more footer flag (`collection.tsx:209`, `221`).

`showsFloatingButtons` (`collection.tsx:185`) depends on `typing` and on the filters drawer path. That is layout, so it should stay in the page.

### Option 1: an app binder module (the review's proposal)

A hook in `src/collection` reads the search state and the copies, decks, and basic lands, and returns what the binder shows: copies, basic lands, the refused chip, the match count, the placeholder kind, try again, and load more. The page keeps layout and the floating buttons.

- Gains: locality for rules 1 to 9. The page drops to layout. The interface is small (search state and order in, one binder view out), so the module is deeper than the page is now.
- Costs: one caller, so the leverage is low. It keeps both text rules; it only moves `matchingBasicLands` behind the module. It is easy to make shallow: if it returns every flag the page now computes, it just moves lines.
- A variant is a pure function from the four reads to the binder view, with the page still calling the reads. It is easier to read but leaves the page wiring four reads.

### Option 2: the server owns which basic lands match

`search_collection` returns the matching basic land cards as their own list with the copies reply, or a sibling function does. In SQL, matching can reuse `private.text_search` and `private.card_filter_conditions` over the twelve rows of `private.basic_land_cards()`, joined to `public.cards`. Then one text rule decides both lists. `basic-land-matches.ts` goes away. The copy row could also carry `commander_art_crop_uri`, as `get_copy` does, which removes the page's `useDecks` call.

- Gains: one source of truth for the text rule, which fixes every row of the drift table. The page loses rules 5 and 8 without a new app module. AI clients could also see the basic lands that match, if the owner wants that.
- Costs: it changes what users see. `land`, `basic`, and `islands` would show more tiles. That is a product decision against the PR #357 wording "whose names match". The server must still refuse basic lands for copy-only chips (finish, condition, language, deck, user tag, free, protected, allocated, price), and the owner must decide whether card chips such as `type:land` or `color:c` now match them. It moves work to SQL in the most-replaced functions (see question 3).
- Glossary fit: basic lands stay "never copies" (`GLOSSARY.md:198`). But "Collection search: a search of the user's copies" (`GLOSSARY.md:267-268`) would need a line saying it also returns the matching basic land cards. A sibling function avoids that change and avoids touching the MCP tool.

### Option 3: give each rule to the module that already owns its inputs

No new module. Move the refused chip merge (rule 3) and the deck failure override (rule 2) into the search state, since `use-collection-search.ts` already owns `chipIndexOfField`, `refusedChipIndex`, `decksFailed`, and `reloadDecks`. It would take the read's refused field and give back one refused chip index and one try again. Carry commander art on the copy row (rule 8). Fix the basic land rule on its own, either option 2's server match or at least drop the dead fields.

- Gains: smallest change, and each rule lands next to its data. No new interface to keep.
- Costs: the page still decides when basic lands show and which placeholder shows. Locality stays split across two modules and the page.

## 3. What does it cost?

### Option 1

- Files: `collection.tsx` (about 25 lines out), one new hook in `src/collection` (about 50 lines), and `basic-land-matches.ts` folded in or kept behind it.
- Tests: none should change. `collection.test.tsx` (1172 lines), `basic-lands.test.tsx` (349 lines), `collection-filters.test.tsx`, and `currency.test.tsx` test through the screen, which `CODING_STANDARDS.md:91-98` asks for. A mutation check on rules 3 and 5 is enough evidence (`CODING_STANDARDS.md:100`).
- Risk: low. The main risk is hook order and memo changes around `useSetIcons`, which depends on the copies list (`collection.tsx:173`). If done before #412, the hook is written against today's `PagedRead` and `FocusedRead` and must change again when #412 lands.
- Standards: the Atomic Design rules allow it. Pages may import from anything, and features may use feature modules (`CODING_STANDARDS.md:56-58`). The page row says pages "load data and fill templates"; the page would still own loading through one call. No ADR conflict.

### Option 2

- Files: one migration that replaces `private.run_search` (13 versions; latest `20261223090000_...sql`) and possibly `private.check_search_query` (10 versions; latest `20261218090000_page_collection_entries_up_to_100.sql`), or one new function plus grants; `supabase/collection.ts`; `supabase/database.types.ts` (regenerated); `supabase/functions/mcp/tools.ts`, whose output schema for `search_collection` is a strict object (`tools.ts:577-581`) and whose copy row `deck` is strict (`tools.ts:220`); `supabase/tests/collection-search.test.ts`; `test/fake-supabase.ts`; `collection.tsx`; delete `basic-land-matches.ts`.
- Tests: the matching cases in `basic-lands.test.tsx:150-195` move to database tests. The app tests would seed the lands in the reply. `supabase/tests/mcp-server.test.ts:578-580` checks `search_collection` summaries and would need a look if the reply changes.
- Risk: medium. `run_search` is a merge hotspot, and `CODING_STANDARDS.md:79` requires starting from the latest version on `main`. The global note on integration branches applies: a ticket branch can miss a `run_search` change that lands on `main`. Adding `commander_art_crop_uri` to copy rows is safe for AI clients, because `toolResult` strips every `*art_crop_uri` key (`tools.ts:36-38`, `69-75`).
- Standards: helpers stay in `private` with closed grants (`CODING_STANDARDS.md:75`); a new public read is `security invoker` (`CODING_STANDARDS.md:74`). No ADR conflict. It needs a glossary update and an owner decision on the match rule.
- Order: after #410, so the new reply field is written once in the contract and the MCP output schema comes from it, not by hand.

### Option 3

- Files: `use-collection-search.ts`, `collection.tsx`, `basic-land-matches.ts`; plus the SQL and types for commander art if taken.
- Tests: none should change for rules 2 and 3.
- Risk: low. The search state would then depend on the copies read's refused field, which ties two modules that are separate today. That edge is the cost.

### What could go wrong in any option

- Behavior drift in the placeholder order. Today `refusedChip` wins over `failed` (`collection.tsx:51-54`), and suggestions hide the placeholder (`collection.tsx:212`). Moving these rules needs the existing tests to keep passing unchanged.
- Building the module before #412 means writing it twice.

## 4. Recommendation

Do it after #412 (and #410), and keep it small. Do not file it now.

Reasons:

- The module has one caller. The set page cannot reuse it, so the leverage claim does not hold.
- #412 and #410 will shrink the reads it composes to about one line each. After that, the page join may be short enough that option 3 is all it needs.
- The real defect is the second text rule in `basic-land-matches.ts`. That is a `CODING_STANDARDS.md:23` finding today, with user-visible drift (`land`, `basic`, `islands`, quoted text). It does not need the binder module. Raise it now as its own owner question: keep the name-only rule from PR #357, or let the server match basic lands with `private.text_search`. If the server path wins, do it after #410 and fold the commander art field into the same migration.
- Drop the dead `sort` and `sort_order` fields whenever `basic-land-matches.ts` is next touched.

Strength: down from Worth exploring to Speculative. The join is real but shallow friction in one page. The part worth a ticket is the basic land text rule, which is a separate and smaller decision.
