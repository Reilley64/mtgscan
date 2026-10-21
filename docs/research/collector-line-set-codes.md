# Reading more set codes in the collector line

Date: 2026-10-21

Research notes for #507. The owner asked: "can we improve the set detection at all?"

Short answer: yes. Changes to the parser and to `decide` alone add 9 correct accepts on the real crops (207 to 216), 31 exact accepts on the simulated scans (2,134 to 2,165), and 10 on the S07 crops (75 to 85). None of them makes a wrong-card accept. A second read on a tighter crop and reading the strip without the 2x upscale add more, but they change latency or need full-resolution phone data to confirm. Accepting on a collector number alone is not safe. It made wrong-printing accepts in the measurements.

Recognizer: `main` at a6fcfaf (PE-Core S16, gallery `20261021-c38f43`). Machine: the owner's Mac (Apple M3, macOS 27.0.1).

## How this was measured

- **Harness.** A temporary worktree, detached at a6fcfaf, added an `experiment` subcommand to the macOS recognizer command. For each image it wrote the image scores (top 60 plus the art siblings of the top 20, in both orientations) and Vision's raw observations (box and top 5 candidates) for a list of reader variants. The patch is not in the repo.
- **Replica.** A Python copy of `CollectorLineReader.parse` and `CardRecognizer.recognize`/`decide` replayed the decision from that output. With the shipping rules it reproduces the recorded results exactly. It matches 261 of 261 real crops (`real/expected-full.json`) and 3,000 of 3,000 simulated scans (`simulated/expected-full.json`), including the held-out counts (0 real, 401 simulated). So every rule change below was measured offline against the same gates, full and held out. The replica is not in the repo. Section 4 has the results of the Swift code that #507 built.
- **Data.**
  - Real crops: the 250 card crops of the evidence pack, 488 x 680. The reader upscales their strip 3x.
  - Simulated scans: the 3,000 Gate 2 photos, rectified to 1191 x 1664 as on the phone. The reader upscales their strip 2x, as on the phone. They are synthetic.
  - S07 crops: the 100 training crops of the owner's S07 run (#472), 488 x 680. They map to the 99 scans by card, not by scan, so duplicates of one printing cannot be told apart. They are not in the repo.
  - Phone emulation: the 488 crops resized to 1191 x 1664 first, then read with the shipping rule. It adds no detail, but it gives the reader the same pixel geometry as the phone (a 266 px strip upscaled 2x to 532 px).
- **Gates.** The tables count accepts, exact accepts, wrong-card accepts, wrong-printing accepts outside the candidate list (Gate 2), right printing first, and held-out accepts. "Held out" removes the true printing from the gallery, as `expected-held-out.json` does.
- **Note on the evidence pack.** The expected files do not record readings. Each scan has only `input`, `truth`, `group`, `top`, `accepted` and `reason`. The readings below come from the harness.

## 1. Why the set code is missed

### Only the 2015 frame prints a set code

Scryfall frame `2015` (M15 onward) prints "SET • EN" under the collector number. The 1993, 1997, 2003 and future frames print no set code at all. The 2003 frame (JOU and BNG in S07) prints only "151/165" at the end of the copyright line. On those cards a missing set code is expected, and the number is the only text evidence. Vision often garbles it there ("1110165" for 111/165, "91165" for 91/165).

### Misses on the 2015 frame

These counts use the shipping reader and parser. They count the cards where `parse` returned no set code or a wrong one, by what Vision returned on the language line.

| Data | 2015-frame cards | Set code missed | No language line read | First character dropped | One character wrong | Code read exactly, parser rejected it | Separator read as a character | Other |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Real crops | 219 | 28 (12.8%) | 14 | 7 | 3 | 2 | 0 | 2 |
| S07 crops | 93 | 12 (12.9%) | 6 | 2 | 2 | 1 | 1 | 0 |
| Simulated scans | 2,682 | 278 (10.4%) | 124 | 18 | 49 | 34 | 0 | 53 |

Examples from Vision's raw text:

- **First character dropped.** "OS • EN" (SOS), "LD • EN" (ELD), "IX • EN" (RIX), "OA • EN" (SOA), "21 • EN" (M21), "15 - EN" (M15). This happens at the left end of the full-width strip. The tighter bottom-left crop reads the same cards as "SOS • EN", "ELD • EN" and "RIX • EN".
- **Code read exactly, parser rejected it.** "M 15 • EN" (space inside the code), "SLD + EN" and "SOS # EN" ("+" and "#" are not in the separator class), "DSCEN" (no separator), "TLA + EN", and "МКС • EN" or "КТК • EN" (Cyrillic letters that look like Latin ones).
- **One character wrong.** "MT5 EN" and "MP5- EN" (M15), "120 • EN" (M20), "SLO" (SLD), "2LD" (ELD). `decide` already fixes a token that is one character from a shortlist set (SLO and 2LD), but only when the token has 3 to 5 characters and a separator.
- **Separator read as a character.** "M210 EN" for "M21 • EN" (Thrill of Possibility). This is also a parser bug. `rarityFirstPattern` reads "M210" as rarity M plus number 210. The phone read 210 on this card too.
- **No language line read.** On the S07 crops these are mostly glare. Torch Fiend, one Wall of Fire copy, and one Goblin Roughrider copy have a white glare patch over the bottom-left corner. The collector line is not visible in the crop, so no reader change can fix them.
- **Other.** On the simulated scans these are mostly promos that print "PRM", Jumpstart and The List cards, and heavy garbling.

### The set size read as the collector number

On M15-era cards, the first line is "136/269 C". When Vision loses "136/", the parser takes "269 C" as number 269 (`numberFirstPattern`). The phone read Wall of Fire as "M15 269". M15 269 is a real printing (a basic land), so the recognizer abstains with "names a card the image does not support". Other garbles of this line are "1387 269 C" (the slash read as 7), "4269 C", and "FI 269 C".

### Resolution: the 2x upscale at read size hurts

`CollectorLineReader.read` upscales the strip until it is at least 300 px tall. On the phone the strip is 266 px (16% of 1664), so the reader upscales it 2x to 532 px. Three measurements say that reading it without the upscale is better.

| Data | Shipping (2x at read size) | No upscale at read size |
| --- | --- | --- |
| Phone emulation, S07 crops | 23 of 93 set codes missed | 10 of 93 |
| Phone emulation, real crops | 28 of 219 missed | 15 of 219 |
| Simulated scans, 800 same-art | 740 of 798 codes read exactly | 754 of 798 |

The S07 crops show the effect most clearly. In the crop path (3x on a 109 px strip), all five S07 M21 misses read "M21 • EN" cleanly. The phone read no set code on any of them. With the phone geometry, the emulation read two of them as "MZ1 •2EN" and "M21 - 2EN". This shows the kind of misread, but not the phone's exact text. Its exact text needs full-resolution phone data (section 3).

A larger upscale is worse. With 6x on the crops instead of 3x, the S07 set reads drop from 81 to 68.

### Region of interest

A crop of the bottom-left corner (0.93 to 1.0 of the height, 0 to 0.6 of the width) reads set codes better than the full-width strip. On the real crops it reads 205 set codes against 192. But on the 488 crops it upscales 4x to 7x and reads digits worse (189 numbers against 223). So it works as a second read, not as a replacement. `regionOfInterest` on the request is the same thing as cropping, so I tested crops.

### Foil glare

The real and S07 misses with no language line are glare, blur, or a cut-off line. The harness cannot separate glare from blur automatically. I checked only the S07 M15 misses by eye. The fix belongs to capture (detect a saturated patch over the collector line and ask for a tilt or a second photo), not to the reader.

## 2. Improvements and measured effects

All numbers come from the replica with Vision output from this Mac. The format is exact accepts / right printing first. The real crops and the S07 crops had no wrong accepts in any configuration, so for them "exact accepts" equals all accepts. The simulated scans count other printings of the right card (mostly same-text twins) apart, as Gate 2 does. Unless a row says otherwise, every configuration has 0 wrong-card accepts (full and held out), 0 Gate 2 accepts outside the candidate list, and 0 real held-out accepts.

Baseline: simulated 2,134 / 2,531 (2,504 accepts, 401 held out), real 207 / 230, S07 75 / 89.

### Safe changes (no new wrong accepts on the gates)

| Change | Simulated | Real | S07 | Risk |
| --- | --- | --- | --- | --- |
| A. Parser fixes plus shortlist-constrained set codes (below) | 2,165 / 2,539 | 216 / 236 | 79 / 92 | Held-out accepts 401 to 407 on simulated, all the right card. 0 on real. |
| A plus: drop a bare "n C" number that names a printing the image does not support | 2,165 / 2,539 | 216 / 236 | 85 / 94 | Falls back to the set code alone. 0 held-out accepts. |
| A plus: a number without a set code puts the one matching same-art printing first, abstains | 2,165 / 2,542 | 216 / 241 | 79 / 92 | Display only. No accept. |
| Set-code accept needs the next other card at least the art margin (0.03) behind | no change | no change | no change | Removes a held-out wrong-card accept (see below). |
| A read set-code line contradicts a top printing in an older frame | no change with A | no change | no change | Removes a held-out accept of Clear a Path as DGM 32 (phone emulation). |

What A does:

1. **Parser.** It maps Cyrillic look-alike letters to Latin. It takes the token before the language code ("EN", or another code after a separator) with spaces removed. It allows "+", "#", "~", "%" and no separator, and one stray digit before "EN" ("M21 - 2EN"). It reads no collector number from the language line, which fixes "M210 EN" as number 210.
2. **Shortlist-constrained set codes.** It matches the token only against the sets of shortlisted printings of the top shortlist cards, as `decide` already does for `setToken`. It uses ordered match levels, and the best level must name exactly one set. The levels, best first, are: exact; equal after mapping look-alikes (O to 0, I/L/T to 1, S to 5, Z to 2, B to 8, G to 6); first character dropped, or a trailing separator read as a character; one character apart. This replaces `oneCharacterApart(printing.set, token)`.

Each part of A, measured with the second read on (see "Needs the owner's decision" below):

- Without the shortlist matching, the parser alone gives simulated 2,170 against 2,195, real 211 against 221, and S07 80 against 86. Most of the gain is the matching.
- The rule against numbers from the language line changes 1 S07 crop, Thrill of Possibility. It matters more as a guard. Without it, "number-only accept" makes a wrong accept on that card (below).
- Reading a number before the set size ("1110165" read as 111 of 165, for the 2003 frame) gave +4 simulated accepts and nothing on real or S07. I left it out.
- Dropping a number that equals the printed set size needs printed sizes. Scryfall's `printed_size` exists for only 169 of 1,062 sets (ELD has none), and the gallery has no set sizes. The "names a printing the image does not support" check gets the same S07 gain without new data.

The **set-code margin guard** matters once more set codes are read. Without it, one simulated scan (Sunlit Hoplite THB 273, held out) read "THB" with no number. The set code alone then accepted Reverent Hoplite THB 33, a different card. The guard leaves all full-gallery accepts unchanged.

### Needs the owner's decision

| Change | Simulated | Real | S07 | Phone emulation (real / S07) | Why it needs a decision |
| --- | --- | --- | --- | --- | --- |
| Safe changes plus a second read on the bottom-left crop when the first read lacks a set code or number | 2,194 / 2,543 | 221 / 243 | 86 / 95 | 217 / 242, 81 / 92 | Latency. It runs on 17% of simulated scans. On the Mac it cost about 35 ms per extra read, against about 65 ms for the first read (noisy timings). |
| Safe changes plus no upscale at read size | 2,192 / 2,542 | crop path unchanged | crop path unchanged | 216 / 241, 83 / 92 | Changes Gate 2 results. Not measured on real phone images. |
| Both | 2,216 / 2,541 | 221 / 243 | 86 / 95 | 218 / 242, 83 / 93 | As above. |
| Accept on a number alone (one same-art printing of the top card has that number) | 2,299 (with both) | 227 | 86 | 222 / 242, 83 / 93 | Makes wrong-printing accepts (below). I recommend against it. |

The phone emulation baseline is 205 / 230 on real and 71 / 90 on S07. "Crop path unchanged" assumes the rule is "upscale only when the strip is shorter than about 250 px". That keeps the 3x upscale for 488 training crops, so Gate 1 does not change.

Merging the second read:

- Use the second reading only when it has a set code and is stronger than the first, and take its set code and number together. In an earlier version I took only the set code and dropped the second read's number. That made a held-out wrong-card accept on the simulated scans (Rabid Gnaw BLB 147 accepted as Rabid Bite BLB 394), because the dropped number 147 would have contradicted it.
- Using the bottom-left crop as the only read also made a held-out wrong-card accept (simulated DTK 221). Use it only as a second read.

Accepting on a number alone:

- On the simulated scans it fires on 113 scans: 86 exact, 21 same-text twins, and 6 wrong printings outside the twins. All 6 are World Championship deck cards accepted as the original printing (for example `wc01 ab30sb` as PLS 30).
- With the shipping parser it would also have accepted Thrill of Possibility as FDN 210 on S07, which is the phone's real reading.
- A collector number of one to three digits is weak evidence. Showing the matching printing first, without accepting it, keeps most of the benefit.

### Vision request options

Each row replaces the first read, with the A rules.

| Option | Effect |
| --- | --- |
| `usesLanguageCorrection = true` | Simulated 2,158 (-7). Real 217 (+1). S07 80 (+1). No gain. |
| Language correction plus `customWords` = shortlist set codes (the open question in #420/#422) | Simulated 2,160 (-5). No gain. |
| `recognitionLevel = .fast` | Much worse. Real set reads 142 against 192. |
| Grayscale and contrast before reading | Much worse. Real set reads 132. |
| `revision = 2` | About the same. +2 set reads on real, -1 accept on 800 simulated. |
| `minimumTextHeight = 0` | Identical output. |
| More upscale (6x on crops) | Worse on crops (real 206, S07 75). About the same on simulated. |
| No upscale at read size | Better (see above). |

## 3. Recommended next step

**Ticket (ready to build, measurable offline): read more set codes in the collector line.** This became #507 (section 4). Scope: `CollectorLineReader.parse` and `CardRecognizer.decide`, plus parser fixture tests for each misread quoted above. It has six parts:

1. Parser fixes: Cyrillic look-alikes, spaced or joined codes, wider separators, and one stray digit before "EN".
2. No collector number from the language line.
3. Shortlist-constrained set codes with ordered match levels, replacing `oneCharacterApart` for set tokens.
4. Drop a bare "n C" number that names a printing the image does not support.
5. A number without a set code puts the one matching same-art printing first. It abstains, never accepts.
6. Two guards: the set-code margin guard and the older-frame check.

Expected effect, measured with the replica: simulated 2,133 to 2,164 exact accepts and 2,531 to 2,542 right printing first; real 207 / 230 to 216 / 241; S07 75 / 89 to 85 / 94. Every gate holds. The real `bun run recognizer:replay` must confirm this, because the replica is not the gate. These baseline figures include the older-frame check, which costs 1 simulated accept with the shipping parser. That is why the baseline here is 2,133 and not 2,134.

**Then a prototype that needs data we do not have:** full-resolution reads from the phone.

- In development builds, keep the collector strip at read size (the bottom 16% of the 1191 x 1664 card, about 1191 x 266, lossless) next to the training crop.
- Add the reader's raw lines to the `RECOGNITION` log line. Today `CollectorLineReading` logs only the set code, number and premium mark, so a phone run cannot show what Vision read.
- With one scanning session of strips (S07 again is enough), decide on two changes: no upscale at read size, and the second read. Both are positive on the simulated scans and in the phone emulation, but neither is measured on real phone images. It would also confirm whether the five M21 misses come from the 2x upscale.

Decisions for the owner:

1. Accept on a number alone. My recommendation is no: it made 6 wrong-printing accepts on the simulated scans and 1 on S07 with the shipping parser.
2. No upscale at read size. It is a one-line change. It changes Gate 2 results, and it needs the strips to confirm on the phone.
3. The second read on a tighter crop. It adds latency on about 17% of scans.
4. A held-out exposure of the set-code rule. When a set prints two same-art printings of a card (Charming Prince ELD 8 and ELD 335) and one is missing from the gallery, a set code read without a number accepts the other one. That is the right card, but it fails the real held-out gate ("0 accepts with the true printing missing"). It happened once in the phone emulation, for the safe changes without the second read. The rule is old. Reading more set codes makes it fire more often. One option is to require a number for a set-code accept when the gallery shows the set has more than one printing of the card in any art.

Not a reader problem:

- Glare over the collector line. Detect it at capture and ask for a tilt.
- 2003-frame cards. They print no set code.
- The scans that remain unresolved on the simulated scans after the safe changes. Many are promos, playtest cards and Jumpstart cards. A few are cards whose correct reading names a printing that the image ranks below `artCheckDepth`, for example LCI 185.

## 4. What #507 built

#507 built the safe changes of section 2 in `CollectorLineReader.parse` and `CardRecognizer.decide`, and added the third guard from decision 4: an accept by set code needs the set to have only one printing of the top card in the gallery. `README.md` (Card recognizer) describes the rules.

The Swift code differs from the replica in these details:

- The look-alike map is the one in #507: O to 0, I, L, and T to 1, S to 5, Z to 2, B to 8, and G to 6. The replica also mapped Q and D to 0 and "|" to 1.
- There are four match levels. The replica had a fifth: a trailing character and one wrong character together.
- When the best level names two sets, the reading has no set code. The replica then fell back to the old one-character rule.
- A code joined to "EN" with no separator, such as "DSCEN", counts only as three uppercase characters at the start of a line. Vision returns rules text in lowercase, such as "oeaen ja cy", and the collector line in uppercase.
- Only a code before a language code is a set token. The replica also kept the code before any two letters, such as "LTM-UT" from the rules text of Fear. In a first run of the Swift code, that token made the older-frame guard stop the accept of Fear ICE 124.

### Replay

`bun run recognizer:replay` on the owner's Mac (Apple M3, macOS 27.0.1) with gallery version `20261021-c38f43`. The format is exact accepts / right printing first.

| Test | Before | Replica, safe changes | #507 |
| --- | --- | --- | --- |
| Real crops (Gate 1) | 207 / 230 | 216 / 241 | 217 / 241 |
| Simulated scans (Gate 2) | 2,134 / 2,531 | 2,164 / 2,542 | 2,161 / 2,542 |
| S07 crops | 75 / 89 | 85 / 94 | 85 / 94 |

Every gate passes. There are 0 wrong-card accepts, full and held out, and 0 Gate 2 accepts outside the candidate list. With the true printing missing, the real crops have 0 accepts, and the simulated scans have 398 (401 before), all another printing of the right card. The S07 crops were checked with the recognizer command outside the replay, with the true printing of each card from the S07 run.

On the simulated scans, 67 results changed:

- 30 scans gained an exact accept.
- 13 abstains now show the right printing first.
- 7 scans now accept another printing of the right card. 5 are The List cards accepted as the printing they reprint, and 2 are promos accepted as their same-text twin.
- 9 abstains now show a same-number printing of the right card first instead of the true printing. 4 are World Championship deck cards shown as the printing they reprint, and 5 are promos shown as their twin without the stamp.
- 3 exact accepts became abstains:
  - Swamp MID 382. MID has 3 Swamps, and no number was read. This is the only exact accept the new set guard costs.
  - Command Tower DMC 204. After the look-alike map, "2MC" is one character from DMC and from another shortlist set, so the reading has no set code.
  - Andrios, Roaming Explorer PH21 1. "121 • EN" is one character from LCI, and LCI 1 names another card.
- Mountain PLST WOE-273 was accepted as WOE 273, and now abstains for the new set guard.
- 4 other abstains changed their first candidate.

On the real crops, 15 results changed. 10 scans gained an exact accept, and 5 abstains now show the right printing first. None lost.

The new set guard costs 1 exact accept on the simulated scans and none on the real or S07 crops.

## Caveats

- The replica is Python, not the Swift code. It reproduced the recorded results exactly, but a port can still differ in details (Unicode letter classes, regex engines).
- Vision ran on macOS 27.0.1 on an M3, not on iOS 27 on the iPhone 16e. The README notes that the macOS version alone moved Gate 1 by 8 accepts.
- The crops are 488 px. The phone emulation adds no detail. The simulated scans are synthetic and use the gallery's own images.
- The research changed no hosted data and nothing on `main`. The S07 crops stay outside the repo.
