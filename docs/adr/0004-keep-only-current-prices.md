# Keep only current prices, with no price history

mtgscan keeps the current USD price of each card printing and finish, and the purchase-day price that each addition line records once. It keeps no dated prices and no daily collection totals, so the collection total has no "change since yesterday" (owner decision, spec 5). The owner wants the smallest price data that the app's features need, and a history kept for a chart that is not planned would grow every day for nothing.

## Consequences

- A price that is not stored now cannot be recovered later. A future value chart or "change since yesterday" starts with no past data.
- The daily collection totals that #125 added are deleted with their table.
- Prices in other currencies convert at the latest exchange rate only (#136). A purchase-day price shown in another currency moves with today's rate.
