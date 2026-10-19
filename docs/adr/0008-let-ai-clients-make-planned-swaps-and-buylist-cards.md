# Let AI clients make planned swaps and buylist cards instead of deck suggestions

Spec 8 built deck suggestions: a record that only an AI client wrote and that the user promoted into a planned swap or a buylist card. Each card the AI proposed took two taps before it reached the deck, promote and then swap in or Bought. The record also needed its own states, pairs, events, and stale rule. The owner decided on 17 October 2026 that an AI client makes planned swaps and buylist cards directly, each with its reason. A deck is still the cards in the user's deck box now, so the AI still never makes a deck change. The AI client's own tool permission setting decides whether the user confirms each write.

## Consequences

- Deck suggestions go away. That covers the tables, the stale rule in deck changes, the three suggestion tools, promote, dismiss, and the deck's Suggestions tab. A migration drops them.
- The user turns down an AI's planned swap or buylist card by closing it. No deck changed, so there is nothing to revert.
- A planned swap from an AI client holds its free copy as soon as it is made, the same as one from the user. The deck's Cards tab marks the outgoing card as planned out.
- The AI names the free copy that its planned swap holds. It never holds a protected copy. When the only free copies are protected, the call is refused and the AI tells the user.
- A planned swap can bring in a basic land and holds no copy for it. This replaces the basic-land promotion that made a deck change at once.
- An AI client does not plan a move between decks. It can recommend one in the chat, and the user makes it.
- An AI client can close an open planned swap or buylist card that an AI client made. ADR 0010 later lets it close any open one. It cannot replace a reason. To change one, it closes the old one and makes a new one.
- The server cannot make an AI client ask the user before a write (#12). In the #304 run, ChatGPT asked before each write, and Deny sent nothing (#336 stops the retry after a Deny). A planned swap or buylist card changes no deck, and closing one undoes it. That makes it safe to rely on the client's setting.
- ADR 0007 still holds. App write functions refuse an AI client's token. The AI's planned swap and buylist functions accept only an AI client's token.

## Considered options

- **Keep deck suggestions.** Rejected. Each card took two taps, and the record's only job was to become a planned swap or a buylist card.
- **Let the AI make deck changes.** Rejected. The deck would show cards that are not in the deck box yet. Reverting one AI change also undoes every later change in that deck. A card that the user does not own still needs the buylist.
