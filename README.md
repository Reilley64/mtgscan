# mtgscan

A cross-platform phone app for rapidly scanning Magic: The Gathering cards, keeping a collection, and building Commander decks. An authenticated remote MCP service lets compatible AI chats search the card catalog and collection, inspect decks, and make deck suggestions.

Product and architecture decisions are being resolved in the project Wayfinder map.

## Development

The repo is a Bun workspace. The Expo app lives in `apps/mobile`.

1. Install dependencies with `bun install`.
2. Build and open the development build in the iOS simulator with `bun run --filter @mtgscan/mobile ios`.

Public build-time settings go in `apps/mobile/.env`. `apps/mobile/.env.example` lists their names. Never put a service role key in the app.

Checks run on every pull request. Run them locally with `bun run typecheck`, `bun run lint`, and `bun run test`.
