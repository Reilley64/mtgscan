# Search corpus

The search release check (#53) runs these searches through catalog search. The corpus follows #15 and #52.

- `search-corpus.jsonl` holds one search per line.
- `search-grades.jsonl` holds one grade per line.
- `search-corpus.ts` reads both files and checks their shape.

## Searches

Each line in `search-corpus.jsonl` has these fields:

- `id`: a unique slug that grades refer to.
- `class`: the search class from 1 to 5.
- `intent`: what the player wants, in plain language.
- `query`: the typed query that the app or an AI client sends to catalog search.
- `reference_query`: a Scryfall search for the same intent. It adds cards to the pool.

The five classes come from #15:

1. Exact card names, as a player types them. Some leave out punctuation or accents, or name one face of a card.
2. Functional searches that Oracle tags reach, such as "ramp" or "board wipe".
3. Rules wording, such as "whenever a creature dies".
4. Filters combined with text.
5. Descriptive searches that neither the card text nor the Oracle tags state, such as "cards like Rhystic Study".

There are 16 searches in each class.

## Pool

The pool of a search is the union of two lists:

- the top 20 results of catalog search for `query`;
- the first 20 Commander-legal paper cards that the Scryfall search `reference_query` returns, ordered by EDHREC rank.

Recall@20 needs relevant cards that catalog search did not return. The Scryfall search adds them. Without it, every graded relevant card would be in the top 20, and recall@20 would always be 1.

The first pool came from a full local import of the 2026-10-10 Scryfall files: cards, Oracle tags, and prices.

## Grading rule

Grade every pooled card from its Oracle text and type line, against the intent of the search.

- **2, exactly what was asked:** the card does what the intent asks as one of its main jobs, and it fits every filter in the query.
- **1, relevant:** a Commander player would accept the card for this search, but it does the job only under a condition, only in part, as a side effect, or in a narrower way than asked. It fits every filter in the query.
- **0, not relevant:** the card does not do what was asked, or it fails a filter in the query.

Rules for each class:

- **Class 1:** the named card is 2. A different card with a face that has the exact name is 1. Every other card is 0.
- **Class 2:** the function counts, not the wording. A card that does it on its own and repeatably, or as its main effect, is 2. A card that does it once as a side effect of a bigger effect is 1.
- **Class 3:** a card whose Oracle text has the wording, or the same rule in current or older templating, is 2. A card whose text has a narrower or close variant of the rule is 1, such as "another creature you control dies" for "a creature dies".
- **Class 4:** a card that fails any filter is 0. Otherwise, grade the text part as in classes 2 and 3.
- **Class 5:** grade by what a Commander player means by the words. Price, popularity, and card strength count only when the intent asks for them, as in "staples" and "fast mana".

Do not grade a card higher because catalog search ranked it high. Do not change a query to fit its results.

## Regrade a card

Each line in `search-grades.jsonl` grades one card for one search:

```json
{"search":"ramp","oracle_id":"…","card":"Cultivate","grade":2}
```

To regrade a card, change `grade` on its line. To grade a new pooled card, add a line. `card` is the card name, for review only.
