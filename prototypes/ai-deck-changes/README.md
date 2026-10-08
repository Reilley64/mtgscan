# AI deck changes prototype (#18)

> **Throwaway Wayfinder prototype.** It answers one question for [#18 Shape AI deck changes, history, and planned swaps](https://github.com/Reilley64/mtgscan/issues/18). What should the deck suggestion, planned swap, buylist, and deck change history screens look like? It is not production code. Do not merge it to `main`.

The page shows four variants of the deck suggestion flow. Each variant is in a phone-sized frame, and `?variant=A|B|C|D` picks one. Without `?variant`, the page opens variant D.

## Open it

```sh
open prototypes/ai-deck-changes/index.html
```

You can also double-click `index.html`. It has no build step and no dependencies. The only network use is card images from `cards.scryfall.io`. Without a network, the dev menu can turn the images off.

## Variants

Switch with the bottom pill, or with the left and right arrow keys. The URL keeps the variant, so a reload stays on it. Variant D also has a layout switcher. See [Layout switcher](#layout-switcher).

- **A · Deck-first.** One deck screen. Deck suggestions appear inline as incoming and outgoing diff rows above planned swaps, the buylist, and the deck list. Deck change history opens in a page sheet.
- **B · Review queue.** One deck suggestion at a time across all decks, with Promote, Dismiss, and Skip. Tabs hold planned swaps and the buylist, and deck change history.
- **C · Timeline.** One chronological feed per deck. It mixes AI suggestions, planned swaps, buylist cards, Bought, swap-ins, deck changes, and reverts. You revert from a selected change in the feed.
- **D · App shell.** The default. A bottom tab bar holds Recent, Collection, Decks, and Scan. It came from owner feedback after A, B, and C. The Recent tab has a badge with the number of items that need you.

All four variants share one in-memory state, so you can do a step in one variant and see the result in another.

### Variant D tabs

- **Recent.** One home across all decks. "Needs you" comes first, oldest first. It lists open deck suggestions, planned swaps that are ready to swap in, and open buylist cards. "Recent changes" comes next, newest first. It lists deck changes, reverts, Bought, swap-ins, promotions, dismissals, AI withdrawals, reason edits, deck priority changes, and scan batches. Each item shows its deck's commander and name. Tap the deck name to open that deck. Filter chips: All, Suggestions, Planned swaps, Buylist, and Deck changes. Promote, Dismiss, Swap in, Bought, and Revert from here work in place and use the same sheets as the other variants.
- **Collection.** Collection search over your collection entries, with All, Free, Allocated, and Protected filters. Search and the filters work in all three layouts. The Binder grid is the default. Tap a card in the grid to open its card detail. See [Card detail](#card-detail). In the List and By card layouts, a tap opens the older collection entry sheet. From that sheet you can protect one free copy or unprotect one copy. There are three layouts:
  1. **List.** One row per collection entry, with its card image, its name and printing, and its owned, free, allocated (by deck), held, and protected counts.
  2. **Binder grid.** The default. Card images, 3 per row, one per collection entry. Corner badges show the owned quantity, free copies, copies in decks, copies held by planned swaps, and protected copies. A legend sits above the grid. Foil entries have a sheen.
  3. **By card.** One row per card with its total owned, free, in decks, held, and protected copies, and its value. Tap a row to expand it into its card printings and their collection entries. Sort by Name, Value, or Recently added. A line above the rows shows the card count, the copy count, and the total value of what the search and filter show. Prices are per card in this prototype.
- **Decks.** There are three layouts of the deck list. Tapping a deck opens the deck screen in every layout.
  1. **List.** Each deck shows its commander, deck priority, deck validity, and estimated bracket.
  2. **Commander gallery.** The default. One large commander art card per row, highest priority first. The deck name, deck priority, deck validity, and estimated bracket sit over the art. A red "Needs you" badge counts the deck's open deck suggestions, ready planned swaps, and open buylist cards.
  3. **Overview table.** One row per deck with these columns: commander, deck priority, cards, deck validity, estimated bracket, value, open deck suggestions, planned swaps, and buylist cards. The commander column stays in place while you scroll sideways. Tap a column header to sort by it, and tap it again to reverse. ▲ and ▼ raise or lower the deck priority by one level. A total row sums the numbers.
- **Deck screen.** A compact header shows the commander picture, the deck name, and the deck priority, deck validity, and estimated bracket chips. When the deck is not valid, the header also shows its violations and the bracket signals behind the estimate. A deck tab bar replaces the app tab bar:
  - **Cards.** The deck list. A row that a planned swap would replace is marked "Planned out", because a planned swap is a commitment you made. Rows that a deck suggestion or buylist card would replace are not marked here. Those stay on the Suggestions tab. Variant A still marks all three.
  - **Suggestions.** Open deck suggestions, planned swaps, and buylist cards, with Promote, Dismiss, Swap in, and Bought. The Suggestions tab badge counts what needs you in this deck. Closed and dismissed items are at the bottom.
  - **History.** The deck change history, newest first. **Revert from here** marks the selected change and every later change with a dashed outline, then opens the revert sheet.

  Opening a deck from Recent opens Suggestions. Opening it from Decks or Collection opens Cards. Opening it from a card detail marks that card's row in the deck list. Opening a deck suggestion from a card detail opens Suggestions and marks that suggestion. The deck screen has no on-screen back button, because the phone's own back gesture goes back. In the prototype, these go back to where you came from and restore the app tab bar:
  - the browser Back button or a trackpad swipe, because opening a deck pushes a browser history entry;
  - a drag from the left 20 px of the phone frame to the right, like the iOS edge swipe;
  - Escape, when no sheet is open.
- **Scan.** A mock of the #11 scanner. The camera area is plain black. In the app, the camera feed replaces the black when the camera is on. The magenta card outline shows only while a card is being detected. The scan batch button is at the top right, and the latest-scan chip is at the bottom. **Prototype: simulate scan** shows the outline and a pulsing placeholder chip for 0.8 seconds, then puts a recognized card into the scan batch. The scan batch sheet adds the batch to the collection. When Bought finds no copies, **Scan copies** opens this tab for the buylist card. After you add the batch, you return to where you were and the Bought sheet opens again.

### Layout switcher

On the Collection tab and the Decks list, a second small pill appears above the variant pill, for example "Collection layout 2 of 3 · Binder grid". Its arrows switch the layout for that tab only. While a card detail is open, the same pill switches the card detail instead, for example "Card detail 2 of 3 · Card page". The ← and → keys still switch only the variant. `?collection=1|2|3`, `?decks=1|2|3`, and `?card=1|2|3` pick a layout and survive a reload. Collection and Decks default to 2. The card detail defaults to 1. Reset data keeps the layouts.

## Card detail

Tap a card in the Collection Binder grid to open its card detail. There are three options. All three show the same facts for the card and the selected collection entry:

- the card image, large;
- the name, the set and collector number, the finish, the condition, and the language;
- the owned, free, in decks, held, and protected counts, for this collection entry and for all copies of the card;
- the decks that use a copy, as deck tags that open the deck at the card's row;
- your other printings and copies of the card, which you can select;
- the price of this printing and finish, the value of this collection entry, and the value of all copies;
- Commander legality and the Game Changer flag;
- the Oracle text;
- the open deck suggestions that bring the card in or take it out, with links that open them in their deck.

Each option can protect one free copy or unprotect one copy, with the same rules as the entry sheet. The deck tags open each deck at the card's row. Owner decision: there is no Find in decks button. **Ask AI about this card** is a disabled placeholder. In the app, it would start a chat about the card in your AI client.

1. **Sheet.** The default. An iOS page sheet over the grid. The big image is at the top, and compact sections are stacked below it. The Oracle text is collapsed. Protect stays at the bottom. Close it with Done, a tap above the sheet, a downward swipe on the top of the sheet, or Escape.
2. **Card page.** The chosen option. A full-screen page that also covers the app tab bar. A hero image is at the top, with Protect below it. The Copies, Decks, Prices, and Rules tabs hold the details, and the Oracle text is shown in full on Rules. It has no on-screen back button. Go back like the deck screen: browser Back, a swipe from the phone's left edge, or Escape.
3. **Binder flip.** The card image fills the width. Swipe left or right, or use ‹ and ›, to go to the next or previous card in the grid's current order, search, and filter. The top shows the position, for example "4 of 18 · Free". A chip row under the image lists every collection entry of the card. Tap a chip to select that collection entry. A drawer at the bottom shows the name, the price, and the actions. Pull it up, or tap its handle, for the rest of the details. Close it with Close or Escape.

Back from a deck that you opened from a card detail returns to the same card detail.

## Dev menu

The menu at the top left is part of the prototype, not the app.

- **Reset data** restores the seed data. Nothing persists.
- **Card images** turns the card images off. Each image then shows its card name.
- **State** shows the full reducer state as JSON beside the phone after every action.
- **Simulate AI** withdraws a suggestion, edits its reason, or adds a new suggestion. A new suggestion can repeat a dismissed one or arrive stale.
- **Remove a catalog record** shows the `cannot determine` validity state on Krenko.
- **Prototype:** buttons inside the phone, with a dashed amber border, are also dev controls.

## Seed data

- Three Commander decks: Atraxa (high priority), Meren (medium, 99 of 100 cards), and Krenko (low).
- Open deck suggestions cover an owned card with two copies, a card whose only free copy is protected, a card whose only copy is in a higher-priority deck, a card you do not own, a basic land, a pair that frees Lightning Greaves from Krenko for Meren, and a suggestion that would make Krenko 101 cards.
- One dismissed and one withdrawn suggestion, one planned swap, one buylist card, and five deck changes. Reverting Atraxa's first change is blocked, and reverting Meren's first change needs a copy that a planned swap holds.

Prices are a Scryfall snapshot from 8 October 2026. The By card layout uses one price per card. The card detail prices each printing and finish. Foil copies without a listed price cost 1.4 times the card price. Oracle text comes from Scryfall. Validity and the estimated bracket are deterministic fake checks over the named cards. The other cards in each deck are only a count.
