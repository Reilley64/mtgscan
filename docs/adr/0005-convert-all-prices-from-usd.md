# Convert all prices from USD

mtgscan stored two prices for each card printing and finish: Scryfall's USD price, the TCGplayer Market price, and Scryfall's EUR price, the Cardmarket guide. Scryfall has no price in most other currencies, and each new currency stored this way adds a column to every price row. mtgscan now keeps only the USD price and converts it into the user's currency when it reads it (#136). This reverses the #8 decision to show Scryfall's EUR price. #136 names this record ADR 0001. There is one source of truth for every price, so there are no two price rules to keep in step.

The owner changed the plan on 2026-10-14 (spec 5). mtgscan keeps only the latest exchange rate of each currency, with its ECB date. It keeps no daily collection totals (ADR 0004). A purchase-day price converts at the latest exchange rate, not at the rate for the day of its addition.

## Consequences

- mtgscan stops reading Scryfall's `eur` and `eur_foil`. The EUR price columns and their stored prices are deleted, and so are the purchase-day EUR prices on addition lines. Lowest prices are kept in USD only.
- A card printing and finish with no USD price has no price in any currency, even when Cardmarket has one. Before the migration, the owner counts the card printings that have a Scryfall EUR price and no USD price, and posts the count on #136.
- A user in Europe sees the TCGplayer Market price converted to EUR, not the Cardmarket price. A price converted from USD is an estimate. The price credit says so once, so the amounts show no "≈" (owner decision on #216).
- A purchase-day price in another currency moves with today's exchange rate. Only the USD amount keeps the value it had on the day of the addition.
- Prices in other currencies depend on the daily exchange rate import. A price converted from USD is stale when its exchange rate is more than 4 days old.
- The set of currencies is not fixed. It is the currencies in Frankfurter's latest rates, plus USD.

## Where conversion happens

The first version converted in the database: every price read took `price_currency` and returned the rate fields (#202). The owner moved conversion to one shared TypeScript module in `@mtgscan/supabase` on 2026-10-15 (#216). Every read now returns USD, and one read, `list_exchange_rates`, returns the rates. The app converts on the phone, so a change of currency reads no prices again. Decks, the buylist, suggestions, and the MCP service use the same module, so each new read does not have to carry a currency. A read that sends `price_currency` is refused, so an old build fails loudly instead of showing USD as another currency.

## Considered options

- **Store a price per currency.** Rejected. Scryfall has only USD and EUR, and every added currency grows every price row.
- **Fall back to the Cardmarket price when the USD price is missing.** Rejected. Two sources would give two price rules.
