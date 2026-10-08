# AI deck changes prototype (#18)

> **Throwaway Wayfinder prototype.** It answers one question for [#18 Shape AI deck changes, history, and planned swaps](https://github.com/Reilley64/mtgscan/issues/18). What should the deck suggestion, planned swap, buylist, and deck change history screens look like? It is not production code. Do not merge it to `main`.

The page shows three variants of the deck suggestion flow. Each variant is in a phone-sized frame, and `?variant=A|B|C` picks one.

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

All three variants share one in-memory state, so you can do a step in one variant and see the result in another.

## Dev menu

The menu at the top left is part of the prototype, not the app.

- **Reset data** restores the seed data. Nothing persists.
- **State** shows the full reducer state as JSON beside the phone after every action.
- **Simulate AI** withdraws a suggestion, edits its reason, or adds a new suggestion. A new suggestion can repeat a dismissed one or arrive stale.
- **Remove a catalog record** shows the `cannot determine` validity state on Krenko.

## Seed data

- Three Commander decks: Atraxa (high priority), Meren (medium, 99 of 100 cards), and Krenko (low).
- Open deck suggestions cover an owned card with two copies, a card whose only free copy is protected, a card whose only copy is in a higher-priority deck, a card you do not own, a basic land, a pair that frees Lightning Greaves from Krenko for Meren, and a suggestion that would make Krenko 101 cards.
- One dismissed and one withdrawn suggestion, one planned swap, one buylist card, and five deck changes. Reverting Atraxa's first change is blocked, and reverting Meren's first change needs a copy that a planned swap holds.

Prices are a Scryfall snapshot from 8 October 2026. Validity and the estimated bracket are deterministic fake checks over the named cards. The other cards in each deck are only a count.
