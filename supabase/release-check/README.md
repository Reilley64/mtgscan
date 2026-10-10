# Search corpus

The search release check (#53) runs these searches through catalog search. The corpus follows #15 and #52.

- `search-corpus.jsonl` holds one search per line.
- `search-grades.jsonl` holds one grade per line.
- `search-corpus.ts` reads both files and checks their shape.
- `main.ts` runs the release check. `release-check.ts`, `chip-check.ts`, and `report.ts` hold its metrics, chip re-check, and report.

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

## Run the release check

Run it from `supabase` with the secret key:

```sh
SUPABASE_URL=… SUPABASE_SECRET_KEY=… bun run release-check --report report.md
```

- `--corpus <directory>` reads another corpus. The default is this directory.
- `--report <path>` also writes the report to a file. The report always goes to standard output.
- `--mode baseline` and `--mode vector` choose the search modes. The default is `--mode baseline`. Give both to compare them. The vector mode gets each search text's embedding from the `embed-search-text` Edge Function and passes it to catalog search as `text_embedding`.
- `--ungraded <path>` sets the file for pooled cards with no grade. The default is `release-check/ungraded-cards.jsonl`, which Git ignores.

To run it against the hosted project, start the Release check workflow by hand in GitHub Actions. Turn on its `vector` input to add the vector mode. It writes the report to the job summary. It uploads the report and the pooled cards with no grade as the `release-check` artifact.

Each search runs as a first page of 20 results. The report has:

- exact-name top-1 for class 1: the card graded 2 is the first result;
- capped recall@20 for each class: the relevant cards in the top 20 divided by the smaller of 20 and the number of relevant cards. Relevant cards are graded 1 or 2. A class takes the mean over its searches;
- uncapped recall@20 for each class, which divides by all relevant cards, as in #15;
- chip violations: the script reads each returned card from the card catalog and checks it against every chip in the query;
- the vector trigger: class 5 capped recall@20 below 0.5;
- abandoned app searches from the last 30 days, after #72 records search follow-ups;
- server p95 latency from the release check telemetry rows, the p95 time to get a text embedding from the Edge Function in the vector mode, and the database size;
- the vector gate from #15, when both modes run: class 5 capped recall@20 rises by 0.15 or more, no other class drops by more than 0.02, the vector mode has no chip violations, its server p95 latency is 300 ms or less, and the database is under 400 MB. The owner checks that recurring cost stays $0;
- the pooled cards with no grade.

A search with no card graded 1 or 2 has no recall and is left out of its class. A gated class with no such searches fails.

The check passes when every exact-name search ranks its card first, classes 2 to 4 each reach a capped recall@20 of 0.7 or more, and no chip is violated. Otherwise it exits with code 1. It exits with code 2 when it cannot run.

To grade the pooled cards with no grade, set `grade` on each line of the ungraded file and add the lines to `search-grades.jsonl`.

