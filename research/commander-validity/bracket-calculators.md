# How other tools estimate Commander brackets

Accessed 2026-10-08 (UTC). This report builds on `bracket-signal-sources.md` and does not repeat it. "Observed" means I read the code, the API output, or the rendered page. "Claimed" means a forum post or a search snippet.

## Commander Spellbook (`POST /estimate-bracket`)

Source: [`estimate_bracket` in variant.py](https://github.com/SpaceCowMedia/commander-spellbook-backend/blob/master/backend/spellbook/models/variant.py) (last commit 2026-09-30) and [site `lib/brackets.ts`](https://github.com/SpaceCowMedia/commander-spellbook-site/blob/main/src/lib/brackets.ts). Observed in code.

**Per-combo classification** (combos fully in the deck):
- `relevant`: produces a STANDALONE feature. `borderline_relevant`: STANDALONE or CONTEXTUAL.
- Card count: library-zone cards and the given commanders are skipped. If the commanders are unknown, commander-capable cards count as "arguable". Notable prerequisites add 1 arguable card, and so does not being borderline-relevant.
- `definitely_two_card`: sure + arguable ≤ 2. `arguably_two_card`: sure ≤ 2 and sure + arguable ≤ 3.
- `speed` is set from `mana_value_needed`, which comes from the combo's `mana_needed` text: 0 → 5, ≤4 → 4, ≤6 → 3, ≤8 → 2, otherwise 1. It gets +1 when `is_mana_needed_an_accurate_minimum` is false.
- Regexes on feature names set `lock`, `skip_turns`, control all or some opponents, MLD, and "infinite (extra) turns".

**Deck rules** (the first match wins):
1. `B`: any card that is not Commander-legal.
2. `R`: any of these:
   - more than 3 GCs or 2+ extra-turn cards;
   - any MLD card, MLD combo, or extra-turn combo;
   - a combo that controls all opponents;
   - a combo with speed ≥4 that is relevant and definitely two cards.
3. `S`: a combo with speed ≥4 that is (relevant and arguably two cards) or (borderline-relevant and definitely two cards), or any lock, skip-turns, or control-some-opponents combo.
4. `P`: any GC, or a combo with speed ≥3 that is relevant and definitely two cards.
5. `O`: a combo with speed ≥3 that is borderline-relevant and arguably two cards.
6. `C`: any extra-turn card, or a combo with speed ≥2 that is relevant and definitely two cards.
7. Otherwise `E`.

Tutors, fast mana, and intent are not inputs.

**Labels.** The UI says "Bracket estimate" and calls it "a guideline rather than a strict classification". Tags show a *minimum* range: E "1+", C "2+", O "2-3+", P "3+", S "3-4+", R "4+". **It never outputs 5.** Bracket 1 vs 2: no flags gives "1+". One extra-turn card or a slow two-card combo gives "2+".

**Override.** None. Commit `99215c44` (2026-03-04) removed `bracket_tag_override`, so combo tags are now computed only. This corrects the earlier note that "editors can override them by hand".

## Moxfield

Observed through a headed browser (plain HTTP is blocked by Cloudflare) and the `api2.moxfield.com` JSON.
- **Fields.** `autoBracket`, `bracket`, `ignoreBrackets`, and `userBracket` (search results only, when set).
- **Override** (observed in 500 search rows):
  - `autoBracket` was always 2–4, never 1 or 5.
  - The effective `bracket` was max(auto, user). One exception: user 1 was accepted when auto was 2. On the first 100-deck pages of the B1 and B5 searches, every B1 deck had user 1 and auto 2, and every B5 deck had user 5 and auto 4.
  - When the user value was below auto, `bracket` stayed at auto. The page showed "Bracket 3\*", with the conflicting card listed under "No Mass Land Denial".
- **Inferred rule** (about 60 decks joined to Scryfall GCs and Moxfield's lists): 4 when GCs ≥4, any MLD, or extra turns ≥4. 3 when GCs are 1–3. Otherwise 2.
  - **Combos are ignored.** Five decks had fast two-card combos (Spellbook Ruthless) but auto 2 or 3. I did not test 0 GCs with exactly 3 extra turns.
  - With no user value, the popover says: "The owner has not specified a bracket. For search purposes only, this deck is being treated as: Bracket 2 – Core." It also shows "Unknown amount of two-card combos".
- **Lists.** The [MLD](https://moxfield.com/commanderbrackets/masslanddenial) (about 74 cards) and [extra-turn](https://moxfield.com/commanderbrackets/extraturns) (about 50) lists are "managed by Moxfield". Scryfall tags have 106 and 53. The [overview](https://moxfield.com/commanderbrackets) allows "Up to 3 Extra Turn Cards" in B2 and B3.
- **Claimed.** On [Nolt #1850](https://moxfield.nolt.io/1850), a responder (probably staff) wrote that users can change the bracket "so long as you don't exceed the minimum metrics". Per-deck opt-out ([#1859](https://moxfield.nolt.io/1859)) is Completed.

## Archidekt

Observed in the production JS ([_app chunk](https://cdn.archidekt.com/_next/static/chunks/pages/_app-35d0a67ea07e357a.js), [8519 chunk](https://cdn.archidekt.com/_next/static/chunks/8519-53757028748a0565.js)) and on a deck page.
- **Estimator** (de-minified):
  - `clean = gc<1 && mld<1 && combo<1 && et<2`. Here `combo` counts pieces of an "atomic" two-card infinite whose partner is also in the deck.
  - The result is `clean && uniqueNames<30 ? 1 : clean ? 2 : (gc<4 && mld<1 && combo<1) ? 3 : 4`.
  - So 2 or more extra turns give 3, and extra turns never give 4. Any atomic combo gives 4. Bracket 1 requires fewer than 30 unique names. The maximum is 4.
  - Tutors are counted ("Non-Land Tutor") but not used. "Potential" combos "do not influence" the estimate.
- **Label.** "Est Bracket: Core (2)". The modal says the deck "could qualify as an Exhibition (1) if that's your intent".
- **Override.** The user value is `edhBracket`. Values 1–3 trigger legality errors:
  - B1: any GC, MLD, extra turn, or two-card combo.
  - B2: the same, except extra turns are not checked, even though the modal says "No extra turns".
  - B3: more than 3 GCs, or any MLD. Combos are not checked.
  - Values 4 and 5 skip all checks.

## EDHREC

Observed: [json.edhrec.com](https://json.edhrec.com/pages/decks/atraxa-praetors-voice.json) has a `bracket` value for each deck. The filter pages say: "This page includes only decks with user-set brackets. Auto-detected brackets are not included." For Atraxa, 35,314 of 45,365 decks had no bracket. The rest were 153, 3,236, 3,951, 2,512, and 199 for brackets 1–5. EDHREC does not estimate brackets itself.

## ManaBox

Not observable. The app is closed, and its web deck pages show no bracket. Claimed only: a v3.19.0 changelog snippet says "Reorganized bracket indicator". Users on Reddit and Facebook say ManaBox calls its estimate rough or "beta". I could not verify the inputs.

## Other tools

- **MTGGoldfish** (seen only in search snippets of its page text; the site blocked me): counts GCs only. 0 gives "Estimated Bracket: 1 or Above", 1–3 gives "3", and 4+ gives "4 or Above".
- **TappedOut** ([forum](https://tappedout.net/mtg-forum/tappedout/commander-bracket-recommendation/), claimed): gives a "recommended bracket" with reasons. It counts tutors (a user thinks "many" means 4+), GCs, and MLD. Users report gaps (Blood Moon, Wildfire, Plea for Guidance). Users set their own bracket with hubs.
- **EDHPowerLevel** ([site](https://edhpowerlevel.com/)) shows a "min" bracket and a "recommended" bracket. The recommendation uses a power score and is never below the min.
  - Combos: two-card combos from Spellbook, kept only when they win or make infinite mana, life, cards, or tokens. "Late" means 8+ total mana.
  - MLD: a text filter plus a list. It also counts spell-tax effects.
  - Extra turns: up to 2 in B2 and 3 in B3. Cards on a "chain" list (Time Warp, Nexus of Fate…) are B4 only.
- **EDHcheck** ([2026-10-08 update](https://edhcheck.com/updates/brackets-follow-wizards-rules/)) uses GCs, two-card combos (Spellbook "fast and relevant" means early, which gives 4), MLD (gives 4), and extra turns.
  - Fast mana and tutors no longer raise the bracket. Exception: any fast mana, Sol Ring included, keeps a deck out of B1.
  - B5 requires a B4 deck with an early combo or power ≥8.5, plus 3 or more of these: 5+ GCs, 3+ fast mana, 5+ tutors, an early combo, power ≥8.5.
- **Playgroup.gg**: uses GCs, banned cards, MLD, extra-turn chains, and Spellbook combos. It "tops out its automatic reading at Bracket 4".
- **Spellweave**: uses GCs and Spellbook two-card combos. It does not count MLD or extra turns yet.
- **CommanderBracket.app** ([accuracy](https://www.commanderbracket.app/accuracy)) uses a win-turn model. GC, MLD, chained extra turns, and two-card combos are hard floors. It outputs 5. It reports 54.3% exact and 96.3% within one bracket against user labels (n=599).
- **Deckstats**: users set the bracket. I found no auto-estimate in its help pages. **Scryfall, mtg.wtf**: only the card-level `is:gamechanger` search.

## Comparison

| Tool | GC | 2-card combo | Combo speed | MLD | Extra turns | Tutors | Fast mana | Intent | Range output | User override |
|---|---|---|---|---|---|---|---|---|---|---|
| Spellbook | >3 → R; any → P | yes | mana-needed buckets | any → R | 1 → C; 2+ → R | computed, unused | no | no | E–R, shown as "N+" | none |
| Moxfield | 1–3 → 3; 4+ → 4 | **no** | no | any → 4 | 4+ → 4 | no | no | user field | auto 2–4 | yes, not below auto (except 1 when auto is 2) |
| Archidekt | 1–3 → 3; 4+ → 4 | yes (atomic) | no | any → 4 | 2+ → 3 | shown, unused | no | user field | 1–4 | yes, with legality warnings for 1–3 |
| MTGGoldfish | only input | no | no | no | no | no | no | ? | "1+", 3, "4+" | ? |
| EDHPowerLevel | yes | yes, filtered | 8-mana cutoff | text + list, incl. taxes | count + chain list | removed | no | power score | min + recommended | — |
| EDHcheck | yes | yes | Spellbook tag | any → 4 | yes | only for 5 | only for 5 and B1 | power score | 1–5 | — |

**Common patterns.**
- All tools use the official GC list with the same 0 / 1–3 / 4+ thresholds.
- Each site curates its own MLD and extra-turn lists, and the lists differ (about 74 MLD cards on Moxfield and 106 in the Scryfall tag).
- Combo data almost always comes from Spellbook.
- Results are labeled as estimates or minimums. The user's value is stored separately. Most tools never output Bracket 5 automatically.

**Notable disagreements.**
1. Combos: Moxfield ignores them. Archidekt sends any atomic two-card combo to 4. Spellbook and EDHcheck use speed.
2. Extra turns: Spellbook gives Ruthless at 2 cards. Archidekt gives 3 at 2 cards. Moxfield allows up to 3 below Bracket 4.
3. Bracket 1: Moxfield never estimates it. Archidekt requires fewer than 30 unique names. EDHcheck treats any fast mana (Sol Ring) as Bracket 2.
4. Tutors: TappedOut counts them. EDHcheck stopped on 2026-10-08. Others compute them but do not use them.
5. Bracket 5: only EDHcheck and CommanderBracket.app output 5 automatically.
