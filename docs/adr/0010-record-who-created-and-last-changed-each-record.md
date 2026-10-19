# Record who created and last changed each record

The owner wants to see whether the user or an AI client last changed a record (19 October 2026). Every record that the user writes gets `created_by` and `updated_by`. Each holds the user's ID or the AI client's ID, taken from the caller's token by Postgres on every insert and update, so a caller cannot set them. They sit beside `created_at` and `updated_at`.

## Consequences

- This covers copies, additions, decks, deck cards, deck basic lands, deck changes, user tags, user tag links, planned swaps, and buylist cards. Records that the server works out on its own, such as deck evaluations, daily collection totals, and MCP call counts, are left out. So are line records that never change after their parent is saved, such as addition lines and deck change lines.
- A change made as a side effect of a call, such as a planned swap moved to the buylist when its held copy is deleted, takes the caller's ID.
- `created_by` replaces `client_id` on planned swaps and buylist cards. `client_name` goes away from planned swaps, buylist cards, and deck changes. mtgscan does not need to know which AI client it was.
- Existing records get the user's ID, except planned swaps and buylist cards, which take their old `client_id`.
- Neither the app nor the MCP read tools return the two fields. The owner reads them in the database.
- With no record of which AI client made a planned swap or buylist card, an AI client can close any open one, including one the user made. This replaces that rule in ADR 0008.
- Needs you shows only the day and time of a planned swap or buylist card. The deck history shows a reason on its own.

## Considered options

- **Only the records an AI client can change.** Rejected. The owner wants one rule for every record the user writes.
- **A "user" or "AI client" value instead of an ID.** Rejected. The owner chose the ID. A record shows the user when the ID matches its owner.
