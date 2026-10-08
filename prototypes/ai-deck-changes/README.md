# AI deck changes prototype (#18)

> **Throwaway Wayfinder prototype.** It answers one question for [#18 Shape AI deck changes, history, and planned swaps](https://github.com/Reilley64/mtgscan/issues/18). What should the deck suggestion, planned swap, buylist, and deck change history screens look like? It is not production code. Do not merge it to `main`.

The page shows four variants of the deck suggestion flow. Each variant is in a phone-sized frame, and `?variant=A|B|C|D` picks one. Without `?variant`, the page opens variant D.

## Open it

```sh
open prototypes/ai-deck-changes/index.html
```

You can also double-click `index.html`. It has no build step and no dependencies. The only network use is card images from `cards.scryfall.io`. Without a network, the dev menu can turn the images off.

## Variants

Switch with the bottom pill, or with the left and right arrow keys. The URL keeps the variant, so a reload stays on it.

- **A · Deck-first.** One deck screen. Deck suggestions appear inline as incoming and outgoing diff rows above planned swaps, the buylist, and the deck list. Deck change history opens in a page sheet.
- **B · Review queue.** One deck suggestion at a time across all decks, with Promote, Dismiss, and Skip. Tabs hold planned swaps and the buylist, and deck change history.
- **C · Timeline.** One chronological feed per deck. It mixes AI suggestions, planned swaps, buylist cards, Bought, swap-ins, deck changes, and reverts. You revert from a selected change in the feed.
- **D · App shell.** The default. A bottom tab bar holds Recent, Collection, Decks, and Scan. It came from owner feedback after A, B, and C. The Recent tab has a badge with the number of items that need you.

All four variants share one in-memory state, so you can do a step in one variant and see the result in another.

### Variant D tabs

- **Recent.** One home across all decks. "Needs you" comes first, oldest first. It lists open deck suggestions, planned swaps that are ready to swap in, and open buylist cards. "Recent changes" comes next, newest first. It lists deck changes, reverts, Bought, swap-ins, promotions, dismissals, AI withdrawals, reason edits, and scan batches. Each item shows its deck's commander and name. Tap the deck name to open that deck in the Decks tab. Filter chips: All, Suggestions, Planned swaps, Buylist, and Deck changes. Promote, Dismiss, Swap in, Bought, and Revert from here work in place and use the same sheets as the other variants.
- **Collection.** Collection search over your collection entries, with All, Free, Allocated, and Protected filters. Each entry shows its card image, its name and printing, and its owned, free, allocated (by deck), held, and protected counts. Tap an entry to open its copies and decks. From that sheet you can protect one free copy or unprotect one copy.
- **Decks.** Each deck shows its commander, deck priority, deck validity, and estimated bracket. Tap a deck to open variant A's deck screen, with a back button and History.
- **Scan.** A mock of the #11 scanner: a dark camera area, a magenta card outline, the scan batch button at the top right, and the latest-scan chip. **Prototype: simulate scan** shows a pulsing placeholder chip for 0.8 seconds, then puts a recognized card into the scan batch. The scan batch sheet adds the batch to the collection. When Bought finds no copies, **Scan copies** opens this tab for the buylist card. After you add the batch, the Bought sheet opens again.

## Dev menu

The menu at the top left is part of the prototype, not the app.

- **Reset data** restores the seed data. Nothing persists.
- **State** shows the full reducer state as JSON beside the phone after every action.
- **Simulate AI** withdraws a suggestion, edits its reason, or adds a new suggestion. A new suggestion can repeat a dismissed one or arrive stale.
- **Remove a catalog record** shows the `cannot determine` validity state on Krenko.
- **Prototype:** buttons inside the phone, with a dashed amber border, are also dev controls.

## Seed data

- Three Commander decks: Atraxa (high priority), Meren (medium, 99 of 100 cards), and Krenko (low).
- Open deck suggestions cover an owned card with two copies, a card whose only free copy is protected, a card whose only copy is in a higher-priority deck, a card you do not own, a basic land, a pair that frees Lightning Greaves from Krenko for Meren, and a suggestion that would make Krenko 101 cards.
- One dismissed and one withdrawn suggestion, one planned swap, one buylist card, and five deck changes. Reverting Atraxa's first change is blocked, and reverting Meren's first change needs a copy that a planned swap holds.

Prices are a Scryfall snapshot from 8 October 2026. Validity and the estimated bracket are deterministic fake checks over the named cards. The other cards in each deck are only a count.
