# mtgscan

This glossary defines the collection and deck-building language used by mtgscan.

## Cards and collection

**Card**:
The shared Magic: The Gathering rules identity represented by one or more printings.
_Avoid_: Oracle card

**Card printing**:
A published version of a card identified by its set and collector number.
_Avoid_: Version, edition

**Collection entry**:
A quantity of owned physical copies that share a card printing, finish, language, condition, and protected flag. Adding a copy with the same properties merges it into the entry. Each addition keeps its own time and purchase-day price. To correct a copy, the user deletes it and adds it again.
_Avoid_: Card, item

**Purchase-day price**:
The current price of a card printing and finish on the day copies were added to the collection. It is recorded on each addition, not on the collection entry.
_Avoid_: Purchase price, cost

**Protected copy**:
An owned copy that the user keeps out of decks. The AI never offers a protected copy as the reason a card is available. A user action that would put a protected copy into a deck warns the user and unprotects it on confirmation. When the only free copies are protected, promoting a deck suggestion holds a protected copy after a warning.
_Avoid_: Don't touch, collection copy

**Collection**:
The user's collection entries.
_Avoid_: Inventory

**Card catalog**:
The searchable Scryfall-derived card identities, printings, rules text, format data, and Oracle tags used to identify and evaluate cards.
_Avoid_: Card database

**Scan batch**:
An editable group of recognized collection entries waiting to be added to the collection together.
_Avoid_: To-add list, import

## Decks and changes

**Deck**:
A Commander deck made from exact owned copies in the collection. Each deck card points to a collection entry and a quantity. Basic lands are the exception.
_Avoid_: Decklist

**Allocation**:
The owned copies of a collection entry that decks use. An owned copy is allocated to at most one deck.

**Free copy**:
An owned copy that is not allocated to a deck or held by a planned swap. An entry's free quantity is its quantity minus its allocated and held copies, and never falls below zero.
_Avoid_: Spare, available copy

**Basic land**:
A card with the basic supertype, including Wastes and snow-covered basics. mtgscan does not track basic lands as owned. A deck can hold any number of them by type, and they never appear in the collection, allocation, or buylist.

**Deck priority**:
How strongly the user wants to keep a deck's cards: high, medium, or low. Priority guides deck suggestions and does not restrict the user.

**Deck validity**:
The deck's conformance to the current official Commander rules, judged on its commanders and main deck. It is valid, invalid, or cannot be determined. An invalid deck remains editable and lists its violations.
_Avoid_: Legality status

**Violation**:
One Commander rule that a deck breaks, with the cards that break it.
_Avoid_: Error, issue

**Bracket signal**:
A fact about a deck that Commander Brackets guidance mentions, such as its Game Changers or extra-turn cards.
_Avoid_: Power level

**Estimated bracket**:
The Commander bracket that a deck's bracket signals suggest. It is an estimate for a pregame conversation, not a certified bracket.
_Avoid_: Bracket, deck bracket, power level

**Deck suggestion**:
An AI proposal to add a card to a deck, optionally replacing a deck card, with the AI's reason. It always names an incoming card. It is open, promoted, dismissed, withdrawn, or stale. An AI cannot suggest replacing a card that has already left the deck. An open suggestion becomes stale when its outgoing card leaves the deck later. Any connected AI client can withdraw an open suggestion or replace its reason, and a withdrawn suggestion stays withdrawn. Promoting it creates a planned swap when a free copy exists, otherwise a buylist card, and both keep the reason. Promoting a basic-land suggestion makes a deck change at once.
_Avoid_: AI change, recommendation

**Planned swap**:
The user's intent to put an owned copy into a deck, optionally replacing a deck card. It holds one free copy until the user swaps it in or the swap closes. Only the user creates planned swaps, directly or by promoting a deck suggestion. A planned swap can replace the commander. It closes when its outgoing card leaves the deck. If its held copy is deleted or used elsewhere after a warning, it becomes a buylist card. Swapping it in makes one deck change. A planned swap is open, swapped in, closed, or moved to the buylist.
_Avoid_: Upgrade

**Buylist**:
The cards the user does not own yet and needs to buy. Each buylist card names a deck and may name a deck card it will replace. It shows the card's default Scryfall printing. It is open, bought, or closed. It closes when that outgoing card leaves the deck. The buylist is separate from planned swaps. Marking a buylist card bought lets the user choose a free copy and puts it into the deck in one deck change.
_Avoid_: Wishlist

**Deck change**:
An atomic record of cards moved into or out of one deck. The user makes every deck change. A change that comes from a deck suggestion keeps its reason. Copies never move directly between decks.
_Avoid_: Changelist

**Deck change history**:
The ordered record of a deck's changes. Reverting a change undoes it and every later change in that deck as one new change. A revert is available only while every copy it needs is still owned and free.
_Avoid_: Audit log, checkpoint

## Search

**Catalog search**:
A search of the card catalog that returns cards. It is separate from collection search.
_Avoid_: Card lookup

**Collection search**:
A search of the user's collection entries. It is separate from catalog search.
_Avoid_: Inventory search

## AI access

**MCP connection**:
The authenticated remote connection through which a compatible AI chat client can inspect the user's card data, search the collection and card catalog, and make deck suggestions.
_Avoid_: MCP/AI connection
