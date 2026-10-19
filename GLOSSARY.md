# mtgscan

This glossary defines the collection and deck-building language used by mtgscan.

## Cards and collection

**Card**:
The shared Magic: The Gathering rules identity represented by one or more printings.
_Avoid_: Oracle card

**Card printing**:
A published version of a card identified by its set and collector number.
_Avoid_: Version, edition

**Art crop**:
Scryfall's image of the art of a card printing, with no frame or text. A double-faced card printing uses the art of its front face. The copy page blurs it behind the card image.

**Card symbol**:
A symbol that Oracle text and mana costs write in braces, such as {G}, {2/W}, {T}, or {E}, as Scryfall's symbology lists it. The app draws it with the Mana font, and VoiceOver reads it as words.
_Avoid_: Mana icon, icon

**Copy**:
One physical card that the user owns. It has a copy ID, a card printing, a finish, a condition, a language, a protected flag, and user tags. Each copy comes from one addition. To correct a copy, the user deletes it and scans it again.
_Avoid_: Card, item, owned card

**Collection entry**:
The copies that share a card printing, finish, condition, language, and protected flag. It is a group of copies, not a thing of its own. Its quantity is the number of its copies. User tags do not split or merge collection entries. Its entry total is the current price of its card printing and finish times its quantity. An entry total is not a collection total.
_Avoid_: Stack, item

**Copy page**:
The page about one copy, opened from its binder tile. It shows the copy's state and its card printing, and its actions menu acts on that copy. Users never see the name: the page shows the card.
_Avoid_: Card page, card detail

**Addition**:
One commit of copies to the collection, with its time and a purchase-day price per card printing and finish. A scan batch becomes one addition. Each stack in it is an addition line, which records its quantity and its purchase-day price.
_Avoid_: Import, purchase

**Current price**:
The latest Scryfall USD price of a card printing and finish. mtgscan keeps only the latest one and no earlier prices. Condition and language do not change it. A missing current price stays missing and is never taken from another finish or card printing. A current price is stale when mtgscan received it more than 24 hours ago. In another currency, it is a converted price.
_Avoid_: Value

**Collection total**:
The sum of the current prices of every copy in the collection, in one currency. Copies with no current price are left out and counted, so the total always comes with its coverage, such as "26 of 27 cards priced".
_Avoid_: Collection value, net worth

**Exchange rate**:
The European Central Bank's reference rate from USD to another currency, as Frankfurter publishes it. mtgscan keeps only the latest exchange rate of each currency in Frankfurter's latest rates, with the ECB date it applies to. The ECB publishes rates on working days only.
_Avoid_: FX rate, conversion rate

**Lowest current price**:
The lowest current price of a card over all its card printings and finishes. Catalog search and card details return it as `price_from`, with its finish. A card with no current price on any card printing has no lowest current price. In another currency, it is a converted price.
_Avoid_: Cheapest price, card price

**Converted price**:
A USD amount, such as a current price, a purchase-day price, or a collection total, times the latest exchange rate of another currency. It is rounded to that currency's minor unit, such as whole yen. It is an estimate, not a store price. The database stores and returns only USD amounts. The app converts them with the shared module in `@mtgscan/supabase`. The MCP connection returns USD amounts only. It is stale when its USD price is stale, or when its exchange rate's date is more than 4 days before today. A card printing and finish with no USD price has no converted price. The app shows it with the currency's narrow symbol, such as "$" for AUD, and no "≈". The price credit says once that prices are converted.
_Avoid_: Local price, FX price

**Price currency**:
The currency that the app shows prices in. The user chooses it in settings, and the phone keeps it. It is USD or a currency with an exchange rate. Prices in a price currency other than USD are converted prices.
_Avoid_: Display currency, local currency

**Price credit**:
The line that names the source of the prices, under the prices of the copy page and as the title of the collection total menu. For USD it reads "Current prices from Scryfall, in USD". For another price currency, it names the TCGplayer Market price via Scryfall, the conversion from USD, and the date of the exchange rate.
_Avoid_: Price note, attribution

**Purchase-day price**:
The current price of a card printing and finish when copies were added to the collection. Each addition line records it once, and it never changes. A copy reads it from its addition line, not from the collection entry.
_Avoid_: Purchase price, cost, price at add

**Protected copy**:
A copy that the user keeps out of decks. Only a free copy can be protected. An AI client never holds a protected copy in a planned swap. A user action that would put a protected copy into a deck warns the user and unprotects it on confirmation.
_Avoid_: Don't touch, collection copy

**User tag**:
A private label on individual copies. The user or an AI client creates it, renames it, deletes it, and puts it on copies or takes it off. A copy can have many user tags. Its name is unique for the user, ignoring case. Renaming a user tag keeps it on its copies, and deleting it takes it off every copy. A deleted user tag can be restored, and it comes back on the copies it was on when it was deleted. A deleted user tag does not hold its name. A user tag is not an Oracle tag.
_Avoid_: Tag, label, collection tag

**Collection**:
The user's copies.
_Avoid_: Inventory

**Card catalog**:
The searchable Scryfall-derived card identities, printings, rules text, format data, and Oracle tags used to identify and evaluate cards. It also holds combos from Commander Spellbook.
_Avoid_: Card database

**Combo**:
Two cards that together produce a result, such as infinite mana or a win, as Commander Spellbook lists it. mtgscan keeps only Commander Spellbook variants with status OK, exactly two cards with one copy each, and no template requirement. A template requirement asks for any card of a kind, not a named card. Each combo keeps its produced features and Commander Spellbook's bracket tag, such as ruthless or spicy. A bracket tag is Commander Spellbook's label, not an estimated bracket. A combo can be a bracket signal.

**Scan batch**:
An editable group of scans waiting to be added to the collection together. Every scan in it has a card printing.
_Avoid_: To-add list, import

**Scan**:
One copy in the scan batch, with its card printing, finish, condition, and language. A card photo makes a scan. **+1** makes another scan for one more copy of the same card printing, with the same finish, condition, and language. Each scan is edited and removed on its own. A scan that was not recognized has no card printing and is not in the scan batch. It shows only on the latest-scan chip. Picking a card printing in name search adds it to the scan batch. The next scan drops it. A basic land and a photo that is not a card make no scan.

**Copy ID**:
The ID of one copy. It never changes. The phone gives each scan a copy ID when it makes the scan, including a scan from **+1**, and the copy keeps it in the collection. Committing the scan batch sends the copy IDs, and the server adds each copy ID once for each user, so a retry never adds a copy twice.

**Stack**:
The scans in a scan batch that share a card printing, finish, condition, and language. Committing the scan batch sends its stacks, and each stack adds its copies to the collection. Batch review shows each scan as its own row, not stacks.

**Gallery**:
The feature prints and printing list that the phone recognizer searches. The owner builds it, and phones download it from Storage. A phone downloads only the parts of the published gallery version that it does not have, checks each part's SHA-256 against the manifest, and switches to the new gallery version only when every part is there.

**Gallery version**:
One build of the gallery: a base plus zero or more add-ons. Each base and add-on is stored as compressed parts, and a manifest lists every part with its SHA-256. An add-on holds new card printings and card printings whose image or printing list row changed. A gallery version reaches phones only after the owner publishes it, and publishing needs a passing parity check. The pointer, `published.json`, names the published gallery version.

**Parity check**:
A check on the iPhone that the phone's feature prints match the gallery rows built on the Mac. It passes when the lowest cosine over 24 reference images is at least 0.98.

**Same-text twin**:
A card printing that prints the same collector line and art as another and differs only by a stamp or symbol.

**Collector line**:
The small print at the bottom of a card printing with its set code and collector number. A star in place of the dot marks a foil copy.

**Recognition**:
The recognizer's answer for one photo of a card: candidate card printings in display order and a decision. The recognizer accepts the first candidate when its rules prove it, and abstains otherwise. The app shows the first candidate either way. An accept names its decision basis, the rule that proved it: the collector line, the set code, or unique art. The art margin is how far the best candidate with other art is behind the top candidate.
_Avoid_: Match, confidence

**Card detector**:
The part of the scanner that finds one card in the camera preview about 5 times a second. Each analyzed frame becomes a detection sample with the card outline, if a card is detected.
_Avoid_: Rectangle detector

**Card outline**:
The four corners of a detected card. The Scan tab draws it in magenta, and the recognizer straightens the photo along it.
_Avoid_: Guide

**Automatic capture**:
The scanner takes one photo when a detected card holds still for 400 ms. It re-arms when the card leaves for 1 second or a different card takes its place.
_Avoid_: Auto-scan, shutter

**Scanner evidence pack**:
The committed real crops, simulated scans, expected results, and phone runs that the recognition release gates replay. Simulated scans are synthetic phone photos rendered from Scryfall images. A held-out run removes each true card printing from the gallery, to show that the recognizer abstains when the right printing is missing.

**Training crop**:
The straightened image of the one card in a scan. After the scan batch commit saves the scan, the crop joins the user's upload queue on the phone. It waits there for a random 1 to 7 days, and then the app uploads it with its evidence record. The evidence record is what the scanner read and decided, which card printing the user saved, and how the user changed or confirmed it. The user changes the card printing in **Other options**, the printing picker, or name search. The user confirms it by choosing the current card printing in the printing picker. A scan from **+1** has no training crop of its own. mtgscan stores training crops with no link to the user's account: no user ID, no copy ID, and no upload time. So a training crop cannot be removed after it uploads. Uploads stop for every user when Storage is 90% full, so that training crops never stop the gallery from updating.

**Bin-deck run**:
A release gate on the iPhone. The owner scans the 30 cards of the test deck in order with a development build of the app, and a script scores each recognition against the deck. It passes with no false accept, the right card first for 29 of 30, the exact card printing first for 27 of 30, and an end-to-end p95 below 1.5 s.

## Sets

**Set**:
A group of card printings that Scryfall publishes under one set code, such as BLB for Bloomburrow. Sets lists every released set that has a card printing in the card catalog, whatever its set type.
_Avoid_: Expansion, edition

**Main set**:
The card printings of a set that come in its regular boosters and are not promos, variations, or basic lands. In a set with no booster cards, such as a Commander deck or a Secret Lair drop, the main set is every card printing that is not a promo or a basic land. In a set made only of promos, it is every card printing that is not a basic land.
_Avoid_: Base set, normals

**Variant**:
A card printing of a set that is outside its main set and is not a basic land, such as a borderless, showcase, or extended art printing. Owning a variant does not count toward the main set.
_Avoid_: Booster Fun, alt art

**Finish view**:
The choice of Any finish, Nonfoil, or Foil that decides which copies light up a card printing in Sets. In Foil, only foil and etched copies count, and a card printing with no foil or etched finish is left out. In Nonfoil, only nonfoil copies count, except that any copy counts for a card printing with no nonfoil finish. The phone keeps the user's choice.
_Avoid_: Finish filter, foil mode

**Set completion**:
The share of a set's main set that the user owns in a finish view, as "x of y" and a percentage. A card printing counts once, whatever the condition, language, protected flag, or deck of its copies.
_Avoid_: Set progress, completion rate

**Set art**:
The art crop of the card printing with the highest current price in any finish among a set's main set and variants, so never a basic land. With no priced card printing that has an art crop, it is the art crop of the first card printing that has one, by collector number. Sets colors it in from left to right as set completion grows.
_Avoid_: Key art, cover art

**Set page**:
The page about one set, opened from Sets. It shows the set's main set and variants in the finish view.
_Avoid_: Set detail, set screen

## Decks and changes

**Deck**:
A Commander deck made from exact copies in the collection. It is the cards in the user's deck box now, not a plan. It has a name, a deck priority, commanders, and a main deck. Each deck card points to one copy. Basic lands are the exception. A deck starts empty. Two decks can have the same name.
_Avoid_: Decklist

**Commander**:
A deck card that the user made a commander of its deck. A deck has no, one, or two commanders. The user can make any deck card a commander, and deck validity judges the choice. Moving a commander to the main deck keeps it in the deck.
_Avoid_: General, promoted card

**Partner ability**:
An ability that lets two commanders lead one deck: Partner, Partner with a named card, Choose a Background, or Doctor's companion. Partner can carry text, such as Partner—Friends forever. Two commanders are a pair when their partner abilities match. A deck with two commanders that are not a pair breaks the partner rule.
_Avoid_: Partner mechanic

**Main deck**:
The deck cards that are not commanders, basic lands included.
_Avoid_: Library, the 99

**Allocation**:
The link between a copy and the deck that uses it. A copy is allocated to at most one deck. Deleting an allocated copy removes it from its deck.

**Free copy**:
A copy that is not allocated to a deck or held by a planned swap. A collection entry's free quantity is the number of its free copies.
_Avoid_: Spare, available copy

**Basic land**:
A card with the basic supertype, including Wastes and snow-covered basics. mtgscan does not track basic lands as owned. Every collection has an unlimited supply of each basic land card: Plains, Island, Swamp, Mountain, Forest, Wastes, and the snow-covered version of each. Collection shows them after the copies, and the user adds them to a deck from there. A deck counts them by basic land card, and its Cards tab shows each one as its own tile. They are never copies, so they never appear in allocation, the buylist, or a set's main set or variants.

**Deck priority**:
How strongly the user wants to keep a deck's cards: high, medium, or low. The user sets it. When two decks want a card and there is only one copy for them, the deck with the higher priority should get it. Between decks of equal priority, the AI decides which deck needs the card more. An AI client follows this in its advice, but nothing enforces it. Priority does not restrict the user.

**Deck revision**:
A number on each deck that starts at 0. Every deck change raises it by one. Creating, renaming, and deleting a deck, and changing its deck priority, leave it as it is.
_Avoid_: Version

**Deck validity**:
Whether a deck follows the current official Commander rules, judged on its commanders and main deck against the rules data. It is valid, invalid, or cannot be determined. A deck with a violation is invalid. A deck with no violation cannot be determined when the rules data that a check needs is missing or not recognized. An invalid deck stays editable, and deck validity never blocks a change. An empty deck has no deck validity.
_Avoid_: Legality status

**Violation**:
One Commander rule that a deck breaks, such as color identity or singleton, with the cards that break it.
_Avoid_: Error, issue

**Effect**:
What a deck change would do to a deck's deck validity, shown before the change. It lists each new violation: a rule the deck does not break yet, or a new card in a rule it breaks. An effect never blocks the change.
_Avoid_: Warning, impact

**Copy limit**:
How many copies of one card a deck can have. It is one for most cards. Some cards allow any number of copies, such as Relentless Rats, or up to a number, such as seven for Seven Dwarves. mtgscan reads it from Oracle text. It is unknown when the Oracle text mentions a copy limit but mtgscan does not recognize it.

**Chosen color**:
The color that a commander that says "choose a color", such as The Prismatic Piper, adds to the deck's color identity. mtgscan infers it. When every card outside the rest of the commanders' color identity shares one color, that color is the chosen color. With no such card, the deck has no chosen color. With such cards in two or more colors, the deck has no chosen color, and those cards break color identity.
_Avoid_: Picked color

**Bracket signal**:
A fact about a deck that Commander Brackets guidance mentions, such as its Game Changers, a two-card combo, or extra-turn cards. Each bracket signal sets a lowest estimated bracket.
_Avoid_: Power level

**Estimated bracket**:
The Commander bracket, 2, 3, or 4, that a deck's bracket signals suggest. Each bracket signal sets a lowest bracket, and the highest of them wins. With no bracket signal, it is 2. It is an estimate for a pregame conversation, not a certified bracket, and it is never cannot be determined. An empty deck has no estimated bracket.
_Avoid_: Bracket, deck bracket, power level

**Rules data**:
The data that deck validity and the estimated bracket read: the card catalog's Commander legality, color identity, Game Changer flag, and deck-construction facts read from Oracle text, such as partner abilities and copy limits; the Oracle tags and the disabled tags; and the combos. Prices and exchange rates are not rules data. Each source of rules data is stale after 7 days without a successful import. A source that was never imported is not stale.
_Avoid_: Rules snapshot, catalog data

**Deck evaluation**:
The stored deck validity, violations, chosen color, estimated bracket, and bracket signals of one deck, with the deck revision it judged and the time of the rules data it read. Each deck change saves a new deck evaluation. Each rules data import, and each Oracle tag that is disabled or enabled, recomputes the deck evaluation of every deck. A deck evaluation is behind when it read older rules data than the latest import, or an Oracle tag changed after it was judged. A failed recompute leaves it behind. mtgscan keeps only the current one. An empty deck has none. Its deck validity is stale when the card catalog is stale or the deck evaluation is behind it. Its estimated bracket is stale when any source of its rules data is stale or the deck evaluation is behind it. A source that was never imported is not stale.
_Avoid_: Validity result, deck check

**Planned swap**:
A plan to put an owned copy or a basic land into a deck, optionally replacing a deck card. The user or an AI client makes it. One from an AI client keeps the AI's reason. It holds one free copy until the user swaps it in or the swap closes. A basic land holds no copy. A planned swap can replace the commander. It closes when its outgoing card leaves the deck, or when the user closes it. An AI client can close any open planned swap. If its held copy is deleted or used elsewhere after a warning, it becomes a buylist card. Swapping it in makes one deck change. A planned swap is open, swapped in, closed, or moved to the buylist.
_Avoid_: Upgrade

**Buylist**:
The cards the user does not own yet and needs to buy. Each buylist card names a deck and may name a deck card it will replace. The user or an AI client adds it. One from an AI client keeps the AI's reason. It shows the card's default Scryfall printing. It is open, bought, or closed. It closes when that outgoing card leaves the deck, or when the user closes it. An AI client can close any open buylist card. The buylist is separate from planned swaps. Marking a buylist card bought lets the user choose a free copy and puts it into the deck in one deck change.
_Avoid_: Wishlist

**Needs you**:
The open planned swaps and open buylist cards that wait for the user. Recent lists them across all decks, and a deck's Planned tab lists those of that deck. The Recent tab, the Planned tab, and each commander gallery card show how many there are.

**Deck change**:
An atomic record of cards moved into or out of one deck, and of commanders made or moved to the main deck. The user makes every deck change. Deleting an allocated copy makes one too. Creating, renaming, or deleting a deck, and changing its deck priority, are not deck changes. A change that comes from a planned swap or a buylist card keeps its reason. Copies never move directly between decks.
_Avoid_: Changelist

**Deck change history**:
The ordered record of a deck's changes. Reverting a change undoes it and every later change in that deck as one new change. A revert is available only while every copy it needs is still owned and free. A copy that it needs but that was deleted or is in another deck blocks it.
_Avoid_: Audit log, checkpoint

## Search

**Catalog search**:
A search of the card catalog that returns cards. It is separate from collection search.
_Avoid_: Card lookup

**Collection search**:
A search of the user's copies. It is separate from catalog search.
_Avoid_: Inventory search

**Chip**:
An exact filter in a catalog search or collection search, such as a color identity or a mana value bound. Every chip in a search must match, and a negated chip must not. A card in the results that fails a chip is a chip violation. In the app UI, "chip" also names a small pill, such as a status label or the scan chip; a search chip is the filter kind.
_Avoid_: Facet

**Search release check**:
A manual run of the graded search corpus through catalog search on the hosted project. It decides whether search is ready to release and whether the vector search experiment is triggered.

## AI access

**MCP connection**:
The authenticated remote connection through which a compatible AI chat client can inspect the user's card data, search the collection and card catalog, make planned swaps and buylist cards, and change user tags. Its address is the MCP server URL, which the settings drawer shows.
_Avoid_: MCP/AI connection

**AI client**:
A compatible AI chat client that the user allowed on the consent page to use the MCP connection. The settings drawer lists each one with the day it was allowed. Revoking it ends its access at once.
_Avoid_: integration

**Consent page**:
The page on the public site where the user signs in and allows or denies an AI client.
_Avoid_: authorization page

**MCP pre-flight**:
A release gate on the hosted project. The owner runs a script that checks the whole OAuth and MCP chain, the way an AI client meets it, before launch and after each Supabase Auth upgrade. It passes when every check passes.
_Avoid_: Smoke test
