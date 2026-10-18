# Set completion in MTG collection apps

Research notes for #363. Date: 2026-10-18.

## 1. How collection apps show set completion

Search note: web search engines (DuckDuckGo, Bing, Google, Mojeek, Startpage) and Reddit's JSON/RSS endpoints blocked or rate-limited automated requests during this session, so findings come from pages fetched directly. Items marked **unverified** come from prior knowledge and need a manual check.

### Echo MTG (verified)
- Each set page shows two separate counters: "You own 0 (0%) of 391 Cards*" and "You own 0 (0%) of 381 Foiled Cards*". So **foil progress is tracked separately from nonfoil**, and the foil denominator only counts printings that exist in foil (381 vs 391 for BLB). Source: https://www.echomtg.com/set/BLB/bloomburrow/
- The footnote says: "*Counts every printing in the set including variants. The variant breakdown (Extended Art, Showcase, basic-land arts, etc) lives in the Tracker/Odds tab if you want per-variant progress." So the headline number is **everything** (a master-set style count), with tabs "All / Normals / Variants / Sealed / Tracker/Odds" for narrower views. Same source.
- The all-sets list has separate "Non-foil %" and "Foil %" columns per set, and tokens are their own set (e.g. "Reality Fracture Tokens", TFRA). Source: https://www.echomtg.com/mtg/sets/

### Other apps (unverified)
Direct fetches of help pages for ManaBox (https://manabox.app/), Moxfield (https://moxfield.com/help), Archidekt (https://archidekt.com/faq), Dragon Shield (https://mtg.dragonshield.com/), Delver Lens (https://www.delverlab.com/), Deckbox (https://deckbox.org/help), Collectr (https://getcollectr.com/) and the TCGplayer app (App Store listing https://apps.apple.com/us/app/tcgplayer/id1247645833) returned either JavaScript shells or pages without any set-completion text. Their App Store descriptions (looked up through the iTunes Search API) do not mention set completion, foil progress, or master sets. The Archidekt FAQ only says Quick Add uses "the most basic (non-promo, non-foil, etc.) version of a card" (https://archidekt.com/faq). The Delver Lens changelog shows it models finishes per printing, with fixes such as "Fix some foil-only issues with database", "Fixed duplicated etched foil entries", and "Adding M3C ripple foils (collector's number #rip)" (https://www.delverlab.com/). Nothing on that page describes a set-progress view.

Prior knowledge, needs a manual check in each app:
- ManaBox and Dragon Shield show a per-set progress bar or "owned / total" in their set browser. I believe the total is every printing Scryfall lists for the set, with no separate foil counter.
- Deckbox, Moxfield, and Archidekt focus on inventory and decks. I know of no headline per-set completion view in any of them.
- Collectr and the TCGplayer app are portfolio and price trackers. Collectr's set progress is Pokémon-first.

## 2. Pokémon terms (unverified, from general hobby usage; no source could be fetched)
- **Set** (or "base set", "standard set"): the cards numbered 1 to the printed denominator (for example 1/198 to 198/198), one copy each, in any finish.
- **Master set**: every card in the set's list. That includes "secret rares" numbered above the denominator, and one **reverse holo** copy of each common, uncommon, and rare that has one. Some collectors also add stamped promos and the Poké Ball and Master Ball pattern variants. Apps such as Collectr and TCGplayer commonly offer both views.

## 3. How MTG collectors use the terms (partly unverified)
- "Complete set" or "full set" usually means the main set, numbered 1 to the old printed denominator, one of each, nonfoil. Basic land art variants are sometimes included. This matches the old printed "/NNN" (Scryfall `printed_size`) and Echo MTG's "Normals" tab (https://www.echomtg.com/set/BLB/bloomburrow/).
- "Foil set" means the same list, all in foil. Collectors treat it as a separate project from the nonfoil set. Echo MTG's separate "Foiled Cards" counter supports this (same source).
- "Master set" is borrowed from Pokémon. In MTG it usually means every printing in the set code: Booster Fun variants (borderless, showcase, extended art), sometimes in every finish. The term is less settled in MTG than in Pokémon. Echo MTG's headline number "Counts every printing in the set including variants" (same source).
- Foil-only and etched printings: in Scryfall these are either a separate printing with its own collector number, or an extra finish on an existing printing. Commander Legends (CMR) etched foils are 101 separate printings, collector numbers 514 and up, with `finishes: ["etched"]` and `booster: false`. In MH2, `etched` is listed as an extra finish on printings that also come in nonfoil and foil (`["nonfoil","foil","etched"]`, 113 printings). Both checked with `https://api.scryfall.com/cards/search?q=e:cmr+is:etched` and `e:mh2 is:etched`. So "foil progress" has to be counted per printing and finish. A flat foil flag is not enough.

## 4. Scryfall fields for deciding a set's main cards

Source docs: [Scryfall Set objects](https://scryfall.com/docs/api/sets), [Scryfall Card objects](https://scryfall.com/docs/api/cards). Live data checks used `https://api.scryfall.com/sets` and `https://api.scryfall.com/cards/search?q=e:blb&unique=prints` on 2026-10-18.

| Field | Object | What the docs say | What it means for "main set" |
|---|---|---|---|
| `printed_size` | set | "The denominator for the set's printed collector numbers." Nullable. | The best signal when present. **But it is null for every set after early 2023.** In the live `/sets` list only 169 of 1062 sets have it, and the newest is ONE (2023-02-10, `printed_size` 271, `card_count` 479). BLB, DSK, MKM, OTJ and all later expansions return null. This matches Wizards dropping the "/NNN" denominator from printed collector numbers starting with March of the Machine. |
| `card_count` | set | "The number of cards in this set." | Every printing Scryfall files under the set code: main set, basic land art variants, borderless, showcase, extended art, starter-deck cards, and so on. BLB: 397. Too big for a "main set" count. |
| `booster` | card | "Whether this card is found in boosters." | In practice Scryfall sets this to true for the regular booster slots and false for Booster Fun treatments. BLB: 281 cards have `booster: true` (collector numbers 1–281, that is, the 261 main cards plus 20 full-art basics). Borderless (282+), showcase, and extended art cards have `booster: false` with `promo_types: ["boosterfun"]`, even though they come from Collector and Play Boosters. Starter-deck-only cards (e.g. BLB 397) are also false. |
| `promo` | card | "True if this card is a promotional print." `promo_types` lists the categories. | Exclude `promo: true` from the main set. Note `promo_types` also carries `boosterfun` on non-promo variants, so it is a useful label, not only a promo flag. |
| `variation` / `variation_of` | card | "Whether this card is a variation of another printing." | Marks alternate printings of the same card in the same set (e.g. star or letter-suffix collector numbers). Exclude from the main count. |
| `set_type` | set | Classification: `core`, `expansion`, `masters`, `draft_innovation`, `commander`, `promo`, `token`, `memorabilia`, `alchemy`, and others. | Decides whether "set completion" makes sense at all. Show completion for `core`, `expansion`, `masters`, `draft_innovation` (and maybe `commander`, `funny`). Hide or de-emphasize it for `token`, `memorabilia`, `promo`, `alchemy`, `minigame`. Separate Scryfall sets such as `pblb` (promos) and `tblb` (tokens) are not part of BLB. |
| `finishes` | card | "foil, nonfoil, or etched". | Tells you which finish slots a printing has. BLB 1–261 are all `["nonfoil","foil"]`. Etched exists only on some printings. |
| `collector_number` | card | String; "can contain non-numeric characters, such as letters or ★". | Use numeric parsing with care. |

**Practical rule for the main set with Scryfall data:** if `printed_size` is set, the main set is collector numbers 1..`printed_size`. Otherwise use cards in the set with `booster: true`, `promo: false`, `variation: false`, and numeric collector numbers. Decide separately whether full-art basics (BLB 262–281) count; they are `booster: true` but sit above the old-style printed size. For BLB the "real" main set that Wizards and the community use is 261 cards.

## 5. Recommendation for mtgscan
1. **Default set size = the main set.** If Scryfall `printed_size` is set, use collector numbers 1..`printed_size`. Otherwise, for sets after early 2023 where it is null, count printings with `booster: true`, `promo: false`, `variation: false`, `digital: false`, and an all-digit collector number. Full-art basics (BLB 262–281) are `booster: true`; leave them in for simplicity, or cap at the first basic land if you want to match the community's 261. A card counts once per printing, in any finish, and any language.
2. **Offer a "Master set" toggle** that counts every non-digital printing under the set code (`card_count`), including Booster Fun variants. Leave out the separate token, promo, and art-series set codes (`t*`, `p*`, `a*`).
3. **Foils: track them as a separate progress number, not inside the main bar.** Show "Set 180/261" and "Foil 40/261", like Echo MTG. The foil denominator counts only printings whose `finishes` include `foil` or `etched`. A nonfoil-only printing never blocks foil completion. A foil-only printing counts for both bars, because foil is its only form.
4. **Etched: treat etched as a foil finish.** It meets the foil goal and the base goal. Do not add a third bar. Etched-only printings with their own collector numbers (CMR 514+) have `booster: false`, so the main set already leaves them out. They show up only in the master set.
5. Show completion only for `set_type` in `core`, `expansion`, `masters`, `draft_innovation`, `commander`, `funny` (maybe `starter`). Hide it for `token`, `memorabilia`, `promo`, `alchemy`, `minigame`, `treasure_chest`.

Main caveat: only Echo MTG could be verified. The claims about other apps are marked unverified and should be checked by hand in each app.
