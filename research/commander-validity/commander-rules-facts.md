# Commander rules facts for mtgscan #14

Accessed: 2026-10-08. Builds on issue #6, which reviewed the 2026-08-07 rules. Scryfall counts come from live searches and the Oracle Cards bulk file updated 2026-10-07T21:01:55Z. Counts will drift.

## 1. Comprehensive Rules

Current file: [MagicCompRules 20260925.txt](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt), "effective as of September 25, 2026", linked from [magic.wizards.com/en/rules](https://magic.wizards.com/en/rules). This replaces the 2026-08-07 file used in #6.

**903.3, commander eligibility (verbatim):** "Each deck has a legendary card designated as its commander. That card must be either (a) a creature card, (b) a Vehicle card, or (c) a Spacecraft card with one or more power/toughness boxes." The designation stays with the card across zones.
- 903.3a: some cards say they "can be your commander". That ability changes deck construction and works before the game (see 113.6n).
- 903.3b/c: a melded or merged permanent that contains the commander is the commander.
- 113.6n: deck-construction abilities "can't affect the format legality of a card, including whether it's banned or restricted."

**903.4, color identity:** the colors of mana symbols in the mana cost or rules text, plus characteristic-defining abilities and the color indicator.
- 903.4b: if a commander's static ability makes you choose its color before the game, that choice sets its color identity.
- 903.4c: ignore reminder text.
- 903.4d: include the back face of a DFC.
- 903.4e: include alternative characteristics, such as adventurer cards.

**903.5, deck construction:**
- a: exactly 100 cards, including the commander.
- b: "Other than basic lands, each card in a Commander deck must have a different English name." Interchangeable names count as the same name (201.3).
- c: every color in a card's identity must be in the commander's identity.
- d: "A card with a basic land type may be included in a Commander deck only if each color of mana it could produce is included in the commander's color identity."
- e: "Commander games do not use sideboards."

**Companion:** the CR has no separate 903 companion rule.
- 702.139a: reveal a companion "from outside the game" if your starting deck meets its condition. Pay {3} as a special action to put it into your hand.
- 702.139b: in Commander, "starting deck" means the deck before you set the commander aside.
- 702.139d: "Cards can enter Commander games from outside the game via the companion special action."
- 903.11a: a card brought in from outside the game cannot share a name with a starting-deck card or fall outside the commander's identity.

**702.124, partner abilities.** 702.124a lists them: "partner, partner—[text], partner with [name], choose a Background, and Doctor's companion."
- Shared rules: 100 cards including both commanders (b). Color identity is the union of both (c). Commander tax and commander damage are tracked per commander (d).
- 702.124f: different partner abilities "cannot be combined."
- 702.124g: a card with two partner abilities uses only one. No combination allows more than two commanders.

| Variant | Pairing rule (702.124) |
|---|---|
| Partner (h) | Both legendary cards have plain "partner". |
| Partner—[text] (i) | Both have the *same* "partner—[text]". Current texts: Character select, Father & son, Friends forever, Survivors. |
| Partner with [name] (j) | Each names the other. Also has an ETB search for the named card. |
| Choose a Background (k) | One card has it. The other is a legendary Background enchantment card. A Background cannot be a commander without that pair. |
| Doctor's companion (m) | One card has it. The other is a legendary Time Lord Doctor creature card with no other creature types. |

The rules now print "Friends forever" as "partner—Friends forever".

## 2. "Can be your commander" cards

The Oracle bulk has 50 objects with this text. 22 are Commander-legal, and all 22 are planeswalkers. Examples: Teferi, Temporal Archmage; Daretti, Scrap Savant; Minsc & Boo, Timeless Heroes; Jace, Multiverse Architect. The other 28 are Un-set, playtest (`mbc`), or promo cards that are `not_legal`.

Live searches:
- `fo:"can be your commander"` returns 33. Search hides some extras.
- `fo:"can be your commander" -is:commander` returns 0. So `is:commander` covers every card with this text.

Scryfall [syntax docs](https://scryfall.com/docs/syntax) say: "use is:commander to find cards that can be your commander." My comparison found these differences (3,731 results):
- It **includes** all 30 Backgrounds. Under 702.124k, a Background is eligible only when paired with a "choose a Background" commander.
- It **includes** 234 cards that are not `legal:commander` (Un-sets, playtest, digital cards).
- It **excludes** cards banned in Commander, even if their type is eligible. Examples: Nadu, Griselbrand, Golos, Erayo.
- It **excludes** meld results. Correct. They are separate Oracle objects (`layout: meld`, `all_parts` component `meld_result`), and `legalities.commander` reports `legal`.
- It correctly includes Grist, the Hunger Tide, which is a creature outside the battlefield.
- Spacecraft: 8 legendary. `is:commander` includes 7. It correctly excludes The Eternity Elevator, which has no P/T.

## 3. Copy-limit overrides and interchangeable names

The Oracle bulk has 13 Commander-legal cards with a "deck can have" override. [Live search](https://api.scryfall.com/cards/search?q=fo%3A%22deck+can+have%22) `fo:"deck can have"` returns 15. The extra 2 are not legal (Vazal, Once More with Feeling).
- **Any number:** Cid, Timeless Artificer; Dragon's Approach; Hare Apparent; Persistent Petitioners; Rat Colony; Relentless Rats; Shadowborn Apostle; Slime Against Humanity; Sphinx's Approach (Reality Fracture, 2026-10-02); Tempest Hawk; Templar Knight.
- **Up to seven:** Seven Dwarves.
- **Up to nine:** Nazgûl.
- Not legal: Tolabow, Loch Rascal (playtest), whose "Rulebreaker" ability changes the color identity rule.

**Interchangeable names (201.3):** these cards count as one name for all rules, deck construction, and legality (201.3a–b). Later printings carry an indicator that names the original set and number (201.3c). Wizards added the rule for the Universes Within versions of the Secret Lair x Stranger Things cards ([2022-04-20 CR changes](https://magic.wizards.com/en/news/announcements/comprehensive-rules-changes-4-20-22)). Scryfall uses one Oracle record for each pair. Example: oracle `a726c27d…` "Cecily, Haunted Mage" has an `sld` print with `printed_name` "Eleven, the Mage". A name-based singleton check should use the Oracle name or oracle_id, not `printed_name` or `flavor_name`. Scryfall's [card docs](https://scryfall.com/docs/api/cards) also say `oracle_id` can differ between cards with the same name (Unstable variants). `reversible_card` objects have no top-level `oracle_id`.

## 4. Scryfall representation and pitfalls

[Card object docs](https://scryfall.com/docs/api/cards): `color_identity` is "This card's color identity". `keywords` is an array of keyword strings. `game_changer` is a nullable boolean.

**`keywords` does not tell partner variants apart** (Oracle bulk counts):

| Oracle text | Scryfall `keywords` |
|---|---|
| Partner (70) | `Partner` |
| Partner with X (54) | `Partner`, `Partner with` |
| Partner—Friends forever (7), —Character select (6), —Survivors (4), —Father & son (2) | `Partner` only |
| Choose a Background (32) | `Choose a background` (lowercase b) |
| Doctor's companion (27) | `Doctor's companion` |

To find the variant, parse the Oracle text line. Amy Pond has both "Partner with Rory Williams" and "Doctor's companion". `is:partner` returns 228. That count mixes all variants, the 30 Backgrounds, and 17 Time Lord Doctors. It does not encode the pairing rules.

**`color_identity` checks:**
- Hybrid counts both colors: Kitchen Finks is `[G,W]`. Phyrexian mana counts its color: Birthing Pod is `[G]`.
- Reminder text is ignored: Syndic of Tithes (extort) is `[W]`.
- DFC back faces are included: Esika // The Prismatic Bridge is WUBRG.
- Implied basic-land-type mana is included: Murmuring Bosk is `[B,G,W]`.
- **Pitfall:** commanders that choose a color before the game (903.4b) have `[]` in Scryfall: Faceless One, The Prismatic Piper, Clara Oswald. Their real identity depends on the player's choice.

**`legalities.commander`:** card-level only. For a meld result such as Brisela it says `legal`, but a meld result is not a deck card. Scryfall's [Terms](https://scryfall.com/docs/terms) make "no guarantees" about legality.

**Bulk format:** the `/bulk-data/oracle-cards` object currently gives only `jsonl_download_uri` (`.jsonl.gz`). It has no `download_uri`.

**Non-game layouts:** the bulk includes `front_card` (291), `art_series`, `token`, and other non-game layouts. Filter these out.

## 5. Banned list and role-specific bans

The [Wizards B&R page](https://magic.wizards.com/en/banned-restricted-list) has 42 named Commander bans. It also bans 25 Conspiracy cards, 9 ante cards, and the offensive-cards list. It says: "Lutri, the Spellchaser - only banned as a companion."

Scryfall `banned:commander` returns **83**. That is 42 named + 25 Conspiracy + 9 ante + 7 offensive cards. The named cards match the Wizards list exactly.

No 2026 B&R announcement after 2026-02-09 (2026-03-23, 05-18, 06-29, 08-10) changes Commander. The [2026-02-09 Commander announcement](https://magic.wizards.com/en/news/announcements/commander-banned-and-restricted-february-9-2026) says Lutri "is unbanned but remains banned as a companion."

Scryfall has no role-specific legality. Lutri shows `legalities.commander: "legal"` and keyword `Companion`. A companion-only ban must be modeled outside Scryfall data.

`is:gamechanger` returns 53. This matches the count in #6.
