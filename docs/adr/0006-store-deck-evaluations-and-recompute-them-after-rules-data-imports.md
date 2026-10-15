# Store deck evaluations and recompute them after rules data imports

mtgscan could judge deck validity and the estimated bracket each time a deck is read. Instead it stores one deck evaluation per deck. Each deck change saves a new one in the same transaction, and each rules data import recomputes every deck's (owner decision, spec 7). The commander gallery, the deck screen, and the MCP deck reads (spec 8) then read one stored result. The same code judges every deck evaluation, so they all agree.

## Consequences

- One judge function makes every deck evaluation and writes nothing. Saving after a deck change, the recompute, and the previews in the Add to deck drawer and the revert page sheet all call it. A preview judges the deck as it would be and compares the result with the stored deck evaluation.
- The recompute is a separate step after each rules data import, and after an Oracle tag is disabled or enabled. One recompute function with its own role reads the card catalog and decks and writes only deck evaluations, so the import role still cannot read or write user data (#43). It runs in one transaction for all decks. A failure leaves every deck evaluation as it was and fails the workflow, and the Daily import retries it while any deck evaluation is behind the latest rules data.
- A deck evaluation can fall behind the latest rules data, for example after a failed recompute. It then shows as stale, with the time of the rules data it used.
- A migration that changes the judge also recomputes every deck.
- mtgscan keeps only the current deck evaluation, with no history. History shows the cards that moved, not how deck validity changed.
- An empty deck has no deck evaluation. Its first card creates one in the same transaction.

## Considered options

- **Judge on every read.** Rejected. It stores nothing and never falls behind, but every read of the gallery, the Add to deck drawer, and the MCP deck reads would judge each deck again.
- **Recompute inside the import.** Rejected. The import role would have to write user data, and a fault in the judge would fail the card catalog import that catalog search and the scanner's card data depend on.
- **Keep a deck evaluation for each deck change.** Rejected. History shows cards, not deck validity, and the revert page sheet already shows the effect before a revert.
