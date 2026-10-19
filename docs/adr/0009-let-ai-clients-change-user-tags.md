# Let AI clients change user tags

ADR 0007 said that an AI client must never change a deck, a copy, or a user tag. The owner decided on 19 October 2026 that an AI client can create, rename, delete, and restore user tags, and put them on copies or take them off. A user tag is a private label. It changes no deck, no copy, and no price, so the AI client's own tool permission setting is enough to confirm each write, as ADR 0008 decided for planned swaps and buylist cards.

## Consequences

- The MCP connection gains `create_user_tag`, `rename_user_tag`, `delete_user_tag`, `restore_user_tag`, and `set_copies_user_tag`. Each calls its own Postgres function, which accepts only an AI client's token. The app's write functions still refuse an AI client's token, including `set_copies_user_tag` from #341. ADR 0007 still holds for every other record.
- The AI tags exact copies by copy ID, up to 100 in one call. To tag every copy of a card, it finds the copy IDs with `search_collection` first.
- Deleting a user tag, or taking it off a copy, marks the record deleted and keeps it. This applies to the user's deletes too. One AI call can take a user tag off hundreds of copies, so a delete must be undoable. Restoring a user tag brings back exactly the links it had when it was deleted, because deleting the tag does not touch its links. Deleted records stay forever.
- A deleted user tag does not hold its name. Restoring one whose name is taken is refused with `user_tag_exists`.
- Before it deletes a user tag, the AI tells the user how many copies have it.

## Considered options

- **Tag by user tag name, and create unknown names on the way.** Rejected. A typo would make a near-duplicate user tag.
- **Tag a card or card printing.** Rejected. It would tag copies scanned later, so a user tag would no longer be a label on individual copies.
- **Remove deleted records for real.** Rejected. An AI delete would leave no trace and could not be undone.
