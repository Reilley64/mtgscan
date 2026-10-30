# Store each copy as its own record

A collection entry was stored as a stack: one row with a quantity, keyed by card printing, finish, condition, language, protected flag, and the set of user tags (#13, #75). Spec 4 stores each copy as its own record with a stable copy ID, and a collection entry becomes the group of copies that share the same properties (owner decision, #63 and spec 4). User tags, protecting, deleting, and later allocation to decks all act on one exact copy. A stack needs a split and a merge for each of them, and a copy key made of an entry ID and a copy number changes when copies leave the entry.

## Consequences

- Scanned copies keep the copy ID the phone gave them. Copies from before this change get a new one.
- User tags are not part of any identity. Tagging a copy never splits or merges collection entries.
- Decks point to exact copies, not to a collection entry and a quantity (spec 6). Deleting a copy removes it from its deck, so no deck picker is needed. This replaces #13 rule 7 ("free copies go first").
- Collection search returned one row per collection entry, as a group of copies, until 30 October 2026. Then only AI clients asked for those rows, and the owner dropped them. Collection search now returns copies only, and AI clients count copies with the owned quantities of catalog search and card details.

## Considered options

- **Keep stacks and split them.** Rejected. Tagging or protecting one copy would move it to another entry, so the tapped binder tile could change identity, and decks would need to follow the split.
- **Stacks plus a copy table for tags only.** Rejected. Quantity would live in two places.
