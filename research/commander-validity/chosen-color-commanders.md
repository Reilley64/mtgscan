# Chosen-color commanders: Archidekt, Moxfield, ManaBox, Scryfall, Commander Spellbook

Accessed 2026-10-08 (UTC). This report builds on `commander-rules-facts.md` (CR 903.4b, Scryfall `color_identity: []`) and does not repeat it. Deck samples are snapshots. "Observed" means I saw it in a public page, a public API, or a shipped JS bundle. "Claim" means a third party said it.

Cards: The Prismatic Piper (plain Partner), Faceless One (Choose a Background, and it is also a Background), Clara Oswald (Doctor's companion). In legal pairings, at most one chosen-color commander is in a deck.

## Summary

| Site | Color picker | Deck identity when no color is set | Off-color validation |
|---|---|---|---|
| Archidekt | None. The color is **inferred** from the deck. | Partner identity + first inferred color | Flags cards only when the deck needs 2+ extra colors |
| Moxfield | Yes. Owner-only, per commander: "Set Color Identity to W/U/B/R/G" | Colorless (Scryfall `[]`) | Flags every card outside partner + chosen color |
| ManaBox | Not found in docs or share pages | Unknown | Unknown (the app has legality checks, but I could not test them) |
| Scryfall | n/a | `[]` | n/a |
| Commander Spellbook | n/a | `identity: "C"` | None. The deck identity is the union of all cards. |

## Archidekt

**Code (observed).** I read the deck-page bundle `cdn.archidekt.com/_next/static/chunks/8519-53757028748a0565.js`. The Commander validator maps `"The Prismatic Piper"`, `"Faceless One"`, and `"Clara Oswald"` to one function. That function runs these steps:

1. It walks `[...mainboard, ...sideboard, ...commanders]` in deck order.
2. The first card that is outside the commanders' identity by **exactly one** color adds that color to `commandersColorIdent`.
3. After that, each card still outside the identity adds the deck error `ADITIONAL_COLOR_COMMANDER`. Its text is in `_app-35d0a67ea07e357a.js`: "Your commander can only add one extra color to the total identity of the deck. It looks like you have more than one color outside your provided color identity".
4. The normal per-card check then adds "You have a card outside of your commander's color identity - <card>".

Consequences:
- There is no stored chosen color. The inferred color depends on card order.
- A card that is 2+ colors outside the identity does not set the color. It only fails the per-card check.
- The deck API (`/api/decks/<id>/`) has no deck-level identity field. The commander's `oracleCard.colorIdentity` is `[]`.

The same `_app` bundle has a second helper. It lists the three names. It uses the full card identity when the deck has exactly one more color than the commanders. I did not trace where the UI uses it.

**Public decks (observed on the deck-page badge):**
- [1586192](https://archidekt.com/decks/1586192): Piper alone with white cards shows **Legal**.
- [6009750](https://archidekt.com/decks/6009750): Shameless Charlatan (U) + Faceless One with white cards shows **Legal**.
- [5613950](https://archidekt.com/decks/5613950): Twelfth Doctor (UR) + Clara with black cards shows **Legal**.
- [3771703](https://archidekt.com/decks/3771703): Piper alone with only colorless cards shows "Legal - Bracket Mismatch".
- [4360367](https://archidekt.com/decks/4360367): Piper + Katerina (W) with B/U/G/R cards shows **Errors**. The list has the "one extra color" message twice, plus "outside … identity - Kaleidostone" and "- Kibo, Uktabi Prince".
- [963958](https://archidekt.com/decks/963958): Tevesh Szat + Piper, a 5-color deck with 145 cards. It shows the "one extra color" message many times, once per offending card.
- The page `<title>` label ignores the inferred color. 5565105 (Twelfth Doctor + Clara with green cards) shows "(Izzet Commander deck)". 6009750 shows "(Mono-Blue …)". Piper alone shows "(Commander deck)".

**No color chosen:** there is no "unset" state. With no off-color cards, the identity is the partner's identity, or colorless.

**Claims:** In [r/EDH "On Archidekt, is there a way to manually set my deck's color identity?"](https://www.reddit.com/r/EDH/comments/1uzc9qc/) (about 3 months ago), the poster says Archidekt treats Clara as colorless and has no manual setting. Replies say Archidekt allows one extra color when Clara is in the command zone, and that a 4th color makes cards illegal. This matches the code above.

## Moxfield

**UI (observed in the bundle `assets.moxfield.net/assets/assets/5573.db07d419c5cea94bb3b4.js`):** The dropdown for a commander card has a branch hard-coded to the three names:
- When no override is set, it shows five items: "Set Color Identity to {W}", {U}, {B}, {R}, {G}. You can choose one color only. There is no colorless option.
- When an override is set, it shows "Clear Color Identity".
- The deck list puts a small mana-symbol icon next to the commander's name. With no override, the icon is a placeholder. With an override, it shows that color. The click handler works only when `isOwner`.

The main bundle sends `PUT /v2/decks/{id}/cards/{cardId}/color-id-override` with `{colorIdentityOverride}`, and `DELETE` to clear it.

**Data (observed, `GET https://api2.moxfield.com/v3/decks/all/<publicId>`):** The commander entry under `boards.commanders.cards` has `"colorIdentityOverride": ["W"]` and `"useColorIdentityOverride": true`. Example: [k6aNO3nj8UCETgPSNEzplA](https://moxfield.com/decks/k6aNO3nj8UCETgPSNEzplA), Sakashima + Piper set to W. When no override is set, the key is absent.

**Identity and validation (observed):**
- The main bundle function computes the commander identity like this: for each commander, use `colorIdentityOverride` when it is set, otherwise use the card's `color_identity`. So **no override means colorless**.
- The per-card check flags any card with a color outside that set. Moxfield does not infer a color.
- Deck pages (headed browser; headless Chrome was blocked by Cloudflare):
  - [C44eTHp8fUac390UAJgDcA](https://moxfield.com/decks/C44eTHp8fUac390UAJgDcA): Faceless One + Charlatan, no override, W/U/B cards. The rule "All cards share the commander's color identity" is `illegal`, with 46 cards listed. The deck list shows red "!" icons on the white cards.
  - [vU0Nn3hEL0-HvDYwun_lWQ](https://moxfield.com/decks/vU0Nn3hEL0-HvDYwun_lWQ): Piper alone, no override, blue cards. The rule fails, and Island is listed.
  - [2JXWzkM_WUGvdA7e9ONxEQ](https://moxfield.com/decks/2JXWzkM_WUGvdA7e9ONxEQ): Piper + Silas Renn, no override, WUBR cards. The rule fails.
  - k6aNO3nj8UCETgPSNEzplA (override W) and [NF_j4jwvYEWGqWpTSbZkoA](https://moxfield.com/decks/NF_j4jwvYEWGqWpTSbZkoA) (Piper, colorless cards): the rule passes.
- **API flags differ from the page:**
  - The deck `colorIdentity` in the API is the union of all cards. C44 returns `["W","U","B"]`, but its commanders' identity is U.
  - The search field `isLegal` is `true` for C44, vU0, and 2JXW, but their pages show them as illegal. The stored flag may be stale, or the server may compute it differently. I could not find out which.
  - Deck search (`/v2/decks/search?commanderCardId=…`) hides illegal decks by default. `showIllegal=true` includes them.
- **Sample** (top 150 decks by views per commander, legal-only search, 444 decks): 391 had an override. 53 did not. 6 of those 53 had 2+ colors beyond the partner.

## ManaBox

- **Docs (observed):** The [Decks FAQ](https://www.manabox.app/guides/decks/faq/) and [Getting started](https://www.manabox.app/guides/decks/getting-started/) guides cover partner commanders. They do not mention chosen-color commanders or a color setting. The [Search FAQ](https://www.manabox.app/guides/search/faq/) has a "Commander colors" filter that the user sets by hand.
- **Shared deck pages (observed):** I checked 5 pages at `manabox.app/decks/<id>` with Clara. Example: [AZ7sXcoedwGFVjXeNtJrPA](https://manabox.app/decks/AZ7sXcoedwGFVjXeNtJrPA), War Doctor + Clara.
  - The page embeds deck JSON (Astro props). Clara has `"colorIdentity": ""`.
  - The deck has a `colors` string, for example `"{R}{W}{B}"`. In all 5 samples it equaled the union of all card identities.
  - There is no override field, and the page shows no legality data.
- **App:** The [App Store version history](https://apps.apple.com/us/app/manabox-mtg/id1460407674) shows deck legality checks: 3.28.1 "Legality indicators with specific legal as commander flags", and 4.1.14 "Support the new Rulebreaker cards in the deck legality checks". It shows dates without years. The order suggests 2026. No entry mentions chosen-color commanders.
- **Not determined:** whether the app has a picker, and how its legality check treats these cards. I found no public example or forum thread. Answering this needs a hands-on test in the app.

## Scryfall

- All three cards have `color_identity: []` and `colors: []`. The `keywords` are `Partner`, `Choose a background`, and `Impossible Girl` + `Doctor's companion`.
- Search treats them as colorless. `!"The Prismatic Piper" id=c` returns 1 card. `id:w` and `commander:w` also match them, because colorless is a subset of every identity.
- Rulings: Faceless One (2022-06-10) says it "both has choose a Background and is itself a Background". It can pair with a "choose a Background" creature or with a Background, but never as part of three commanders. No ruling covers the chosen color in deck building.

## Commander Spellbook

- `GET backend.commanderspellbook.com/cards/?q=<name>` returns `identity: "C"` for all three cards.
- `POST /find-my-combos` (observed): `results.identity` is the union of the commanders and the main deck. It does not check legality.
  - Piper alone + Thassa's Oracle + Demonic Consultation + Sol Ring returns `"UB"` with 1 combo in `included`.
  - Faceless One alone and an empty commander list return the same result.
  - Clara + Twelfth Doctor returns `"UBR"`.
  - Tymna (W) with U/B cards returns `"WUB"`.
- So a chosen-color commander works as a wildcard. Off-color cards never move combos into `almostIncludedByAddingColors`.
- Source: [`find_my_combos.py`](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/views/find_my_combos.py) passes `deck.identity` through. I saw no special case for these cards.

## Open points

- ManaBox in-app behavior is not verified.
- I could not tell whether Moxfield's server-side `isLegal` is stale or uses a different rule from the page.
- Archidekt's order-dependent inference can pick a different color than the player wants. I saw this in code, not in a reproduced bug.
