# Commander bracket signal sources

Accessed 2026-10-08 (UTC). This report builds on issue #6. It does not repeat the bracket rules from that issue. All counts are snapshots and will change.

## 1. Scryfall Game Changers

- The [Card object](https://scryfall.com/docs/api/cards) has `game_changer` (Boolean, nullable): "True if this card is on the Commander Game Changer list."
- The [syntax guide](https://scryfall.com/docs/syntax) documents `is:gamechanger`.
- `GET https://api.scryfall.com/cards/search?q=is:gamechanger` returned `total_cards: 53`. The Oracle Cards bulk file (built 2026-10-07T21:01Z) also has 53 cards with `game_changer: true`.
- The [Wizards Commander page](https://magic.wizards.com/en/formats/commander) lists 53 unique names across its color blocks. The two sets match. The only difference is the name form: Wizards writes "Tergrid, God of Fright", and Scryfall writes "Tergrid, God of Fright // Tergrid's Lantern". A name join must handle double-faced names.
- The Wizards page embeds content blocks with `updatedAt` values. The last list edits are dated 2026-02-09, which matches the [2026-02-09 update](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026).
- **I could not determine how fast Scryfall tracked that change.** Wayback Machine CDX had no snapshots of the relevant Scryfall URLs, and some queries returned 503. A community thread, ["Game Changers now show in Scryfall"](https://www.reddit.com/r/magicTCG/comments/1ingh2c/), suggests Scryfall added support close to the February 2025 launch. Reddit blocked a fetch of the thread date. Scryfall publishes no latency commitment for this field.

## 2. Scryfall Oracle tags

Source rules:

- Tags come from [Tagger](https://tagger.scryfall.com). Scryfall calls it "a community-maintained project". Scryfall imports tags daily ([Tagger Tags](https://scryfall.com/docs/tagger-tags)).
- A new [Tags API page](https://scryfall.com/docs/api/tags) documents an **Oracle Tags bulk file** (`type: oracle_tags`, JSONL.gz, about 6 MB, updated daily). It lists each tag's `id`, `slug`, `label`, `description`, `parent_ids`, `child_ids`, `aliases`, and `taggings[]`. Each tagging has an `oracle_id`, a `weight` (`very_strong`, `strong`, `median`, or `weak`), and an optional `annotation`. You get cards by joining to Oracle Cards on `oracle_id`.
- The same page gives these warnings: Scryfall "cannot guarantee that tag data is 100% free from intentional errors or abuse". Do not treat slugs as permanent; use the tag `id`. Apps are "strongly recommended" to support turning off the display of individual tags.
- Bulk taggings are direct only. A parent tag such as `tutor` has 0 direct taggings, so an app must walk `child_ids` to get its members.
- Use terms: the general [API data rules](https://scryfall.com/docs/api) apply. Data is free for Magic software. Do not paywall it, do not just republish it, and do not imply that Scryfall endorses the app. I found no separate license for tags. Search rate limit: 2 requests per second. A 429 response blocks the client for 30–60 s ([rate limits](https://scryfall.com/docs/api/rate-limits)).

Relevant tags. The search counts come from `/cards/search` with default options. The bulk counts are direct (or expanded) taggings in the 2026-10-07 file.

| Signal | Exact slug | Search count | Bulk count | Note |
| --- | --- | --- | --- | --- |
| Extra turns | `extra-turn` | 58 (`f:commander`: 53) | 64 | Description: "Cards that grant extra turns." The 6 extra bulk entries are schemes, planes, Vanguard, and Un-cards. |
| Mass land denial | `mass-land-denial` | 111 (`f:commander`: 106) | 113 | Its description copies the Wizards wording. It includes Armageddon, Ruination, Sunder, Winter Orb, Blood Moon, and Back to Basics. |
| Tutors | `tutor` (parent, 27 children) | 1163 | 1221 expanded | Child `tutor-land` has 613. `otag:tutor -otag:tutor-land mv<=3` returns 265. |
| Fast mana | **no `fast-mana` tag** | — | — | The closest tags are `moxen` (13; alias `manarock-mox`), `ritual` (69), `mana-rock` (384), `adds-multiple-mana` (511), and `ramp` (2286). |
| Land denial details | `blood-moon-effect` 20, `removal-land` 509, `tapper-land`, `freeze-land`, `lockdown-land` | | | These are narrower or broader than MLD. |
| Stax-like | `rule-of-law` 13, `hatebear` 69, `tax` (parent) | | | There is **no `stax`, `land-destruction`, `armageddon`, or `fast-mana` tag** (search returned 404). |

There are no combo or "two-card infinite" Oracle tags. No current Game Changer has the `mass-land-denial` or `extra-turn` tag. Thirteen Game Changers have `tutor` tags.

## 3. Commander Spellbook

The API root is `https://backend.commanderspellbook.com/`. The OpenAPI 3.0.3 schema at `/schema/` reports "Commander Spellbook API" version 7.1.8.

- **(a) Find combos in a decklist: yes.** Use `POST /find-my-combos` (JSON `DeckRequest` or `text/plain`). The body is `{"main":[{"card":"Name","quantity":1}], "commanders":[...]}`, with at most 600 main entries and 12 commanders. The response is a paginated object with `results` = `{identity, included[], includedByChangingCommanders[], almostIncluded[], almostIncludedByAddingColors[], ...}`. Each item is a `Variant`. My test deck (Thrasios/Tymna, Thassa's Oracle, Demonic Consultation, Isochron Scepter, Dramatic Reversal) returned 2 included and 32 almost-included combos.
- **(b) Bracket estimation: yes.** Use `POST /estimate-bracket` with the same body. The query flag `unknownCommanders` is optional. The response is `{bracketTag, cards[], combos[]}`:
  - Each card has `banned`, `gameChanger`, `massLandDenial`, `extraTurn`, and `quantity`.
  - Each combo has `relevant`, `borderlineRelevant`, `arguablyTwoCard`, `definitelyTwoCard`, `speed` (1–5+), `massLandDenial`, `extraTurn`, `lock`, `skipTurns`, `controlAllOpponents`, and `controlSomeOpponents`.
  - My test deck returned `R` (Ruthless). The cards flagged were Thassa's Oracle and Rhystic Study (GC), Armageddon and Winter Orb (MLD), and Time Warp (extra turn). A two-line deck (Sol Ring, Command Tower) returned `E`.
- **(c) Combo metadata.** A `Variant` has `uses`, `requires`, `produces` (features such as "Win the game"), `identity`, `manaNeeded`, `manaValueNeeded`, prerequisites, `description`, `popularity`, `salt`, `bracketTag`, `legalities`, `prices`, and `variantCount`. Two-card status is computed per deck in the estimator; it is not a stored field. The bracket tags are `R` Ruthless, `S` Spicy, `P` Powerful, `O` Oddball, `C` Core, `E` Exhibition, and `B` Banned. The [syntax guide](https://commanderspellbook.com/syntax-guide/) calls these tags a "qualitative association", "rather than a strict classification". Editors can override them by hand. The database has 113,852 variants, and 6,519 of them match `bracket=4`.
- **How the estimator works.** See [`estimate_bracket`](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/models/variant.py) and the [Scryfall sync task](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/tasks/scryfall.py). The card flags come from Scryfall: `game_changer` from the card field, `mass_land_denial` from the `mass-land-denial` tag, and `extra_turn` from the `extra-turn` tag. Tutors are the `tutor` tag minus `tutor-land` and `tutor-seek`, limited to mana value ≤3. The tutor value is computed, but the estimator does not use it. The rules return Ruthless for any of these: more than 3 GCs, 2 or more extra-turn cards, any MLD card, or a fast, relevant, definite two-card combo. The code uses fixed rules only. It does not ask about player intent.
- **Bulk export.** `https://json.commanderspellbook.com/variants.json.gz` is about 29 MB and was last modified 2026-10-08 03:12 GMT. The API description asks clients to use this file and not to page through the whole dataset.
- **Rate limits and etiquette** (from the schema description). Send "sparse, unauthenticated requests". Name your service in `User-Agent`. "80 requests per minute should be a safe rate". Handle 429 responses. Credit the project and link to commanderspellbook.com. There is a TypeScript client, `@space-cow-media/spellbook-client`.
- **License and open source.** The backend and site are MIT-licensed on GitHub ([backend](https://github.com/SpaceCowMedia/commander-spellbook-backend), [site](https://github.com/SpaceCowMedia/commander-spellbook-site)). Both had pushes on 2026-10-07. The [About page](https://commanderspellbook.com/about/) says the code is "completely free and open source under the MIT license" and that the project powers EDHREC's combo feature. **I found no separate license or terms of use for the combo data.** `/terms/` returns 404. Only a [privacy policy](https://commanderspellbook.com/privacy-policy/) and the Fan Content Policy notice exist. The MIT license covers code. Whether it also covers the community-entered data is unclear.

## 4. Other sources and prior art

- **Wizards** publishes a machine-readable Game Changer list only as HTML on the Commander page (embedded content blocks). It publishes no list of MLD or extra-turn cards. It gives a definition and examples only ([Introducing Commander Brackets Beta](https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta)). I found no official data feed.
- **Moxfield** has pages such as [moxfield.com/commanderbrackets/masslanddenial](https://moxfield.com/commanderbrackets/masslanddenial) that quote the Wizards MLD definition. The pages are rendered with JavaScript, and I found no public API. Its UI says "Estimated Bracket" ([community report](https://www.reddit.com/r/magicTCG/comments/1iolvus/)).
- **Archidekt** launched estimates on about 2025-02-11 using only GC count ("1 or 2", "3", "4 or 5"), "since mass land denial, tutors, and combos aren't as objective" ([news post](https://archidekt.com/news/11356226)). A moderator later said the estimator also counts nonland tutors, extra turns, MLD, GCs, and two-card infinites ([forum](https://archidekt.com/forum/thread/14871568)). Users can override the estimate.
- **EDHREC** gets its combo data from Commander Spellbook (About page).
- Pattern across tools: all label the result an *estimate*, all let users override it, and all derive MLD and extra-turn signals from community-maintained lists.
