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
A quantity of owned physical copies that share a card printing, finish, language, condition, purchase details, status flags, and storage group.
_Avoid_: Card, item

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
A Commander deck made from exact owned copies in the collection. An owned copy can be allocated to only one deck.
_Avoid_: Decklist

**Deck validity**:
The deck's current conformance to Commander rules. An invalid deck remains editable and lists the rules it violates.
_Avoid_: Legality status

**Planned swap**:
A card to acquire paired with the card it will replace in a deck. Choosing "swap in" selects the exact acquired collection entry to allocate.
_Avoid_: Upgrade

**Buylist**:
The acquisition side of the user's planned swaps. A buylist card always belongs to a planned swap.
_Avoid_: Wishlist

**Deck change**:
An atomic record of cards moved into or out of a deck. AI changes include a reason; user changes may omit one.
_Avoid_: Changelist

**Deck change history**:
The ordered record of deck changes. A change can be reverted while its inverse still satisfies collection allocation rules.
_Avoid_: Audit log

## Search

**Catalog search**:
A search of the card catalog that returns cards. It is separate from collection search.
_Avoid_: Card lookup

**Collection search**:
A search of the user's collection entries. It is separate from catalog search.
_Avoid_: Inventory search

## AI access

**MCP connection**:
The authenticated remote connection through which ChatGPT can inspect the user's card data, search the collection and card catalog, and request confirmed deck changes.
_Avoid_: MCP/AI connection
