# Read set sections from Scryfall's set pages

The set page shows a set's card printings in set sections, the named groups that Scryfall's set page lists, such as "Draconic Showcases" or "Mana Foils". The Scryfall API has no sections. The set object and the card object have no field for them, and Scryfall seems to curate them by hand for each set. So a weekly import reads each set's Scryfall page for its section names and the search link under each header, and then runs each search through the Scryfall API to find the card printings in that section.

The search links come in two kinds. Newer sets use collector number ranges, such as `e:dsk cn≥302 cn≤327`. Older sets use rules, such as `set:afr frame:showcase` or `set:afr is:bab`. Running every search through the API handles both kinds the same way. For Forgotten Realms, Dominaria United, Core Set 2021, and Ikoria, the sections together listed every card printing that is not a basic land.

Scryfall's terms of service do not forbid reading these pages. They forbid putting undue burden on Scryfall, and `robots.txt` allows `/sets`. The Scryfall API allows 2 searches a second, so reading every set in full takes about 1,000 page reads and up to 10,000 searches, or about 1.5 hours. The first run does that once. After that, the import reads a set's page only when its set sections were never read, when it came out in the last 180 days, or when it has a card printing that no stored set section lists. It runs a set's searches only when the page's sections or searches changed, or when the set has a card printing that no set section lists.

## Consequences

- The page HTML is not a stable contract. When reading a set's sections fails, the import keeps that set's last stored set sections, goes on with the other sets, and exits non-zero with the code of each failed set.
- A card printing can be in more than one set section, as on Scryfall. Dominaria United's textured foil showcases are in both "Showcase Cards" and "Textured Foil Cards".
- Set sections do not change the main set or set completion. Scryfall's sections cut across the main set. Foundations' main set is "New Cards" and "Reprints", and Duskmourn's main set includes its "Lurking Evil Art Variants".

## Considered options

- **Build the sections from Scryfall API fields.** We grouped each set into runs of consecutive collector numbers with the same `border_color`, `frame_effects`, `promo_types`, `full_art`, `frame`, and `promo`. Across 23 sets with sections, from Kaldheim to Marvel's Spider-Man, this matched 122 of 217 sections exactly. It cannot tell sections apart when their cards have the same fields, such as Tarkir: Dragonstorm's Draconic and Ghostfire showcases, and it cannot find the names. Rejected.
- **Group by rarity or color.** Rejected. These groups are not how collectors complete a set, and they say little about variants.
