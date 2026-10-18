import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { BuylistCardInput } from '../buylist';
import type { Deck, DeckChangeEffect, DeckChangePage } from '../decks';
import type { PlannedSwapInput } from '../planned-swaps';
import { aiClientRefusal, connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { addedToBuylist, buylistCardItem, listedBuylist, oneBuylistCard } from './buylist-card-seeds';
import { basicLand, catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import type { TestUser } from './local-stack';
import {
  appRead,
  appRequest,
  copyOf,
  deckNamed,
  krenkoDeck,
  listed,
  mountain,
  planned,
  plannedSwapItem,
  plannedSwapNamed,
  scannedCopy,
  type KrenkoDeck,
} from './planned-swap-seeds';

setDefaultTimeout(60_000);

const island = basicLand('Island').oracle_id;
const forest = basicLand('Forest').oracle_id;
const shock = 'b8fed52c-e84e-41c9-b683-d8b26fa03c5f';
const goblinInstigator = '90cef94d-d941-4e08-afec-a116626b74fb';
let goblinInstigatorCard: string;
let krenkoCard: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  [goblinInstigatorCard, krenkoCard] = await Promise.all(['Goblin Instigator', 'Krenko, Mob Boss'].map(oracleIdOf));
});

function basicLandLine(name: string) {
  return {
    kind: 'basic_land',
    oracle_id: basicLand(name).oracle_id,
    name,
    image_uris: [expect.stringContaining('https://cards.scryfall.io/normal/')],
  };
}

function bringingIn(user: TestUser, deckId: string, landOracleId: string, changes: Partial<PlannedSwapInput> = {}) {
  return plannedSwapItem(user, deckId, '', { incoming: { basic_land_oracle_id: landOracleId }, ...changes });
}

async function basicLandCount(user: TestUser, deckId: string, landOracleId: string) {
  const deck = await appRead<Deck>(user, 'get_deck', { deck_id: deckId });
  return deck.basic_lands.find((land) => land.oracle_id === landOracleId)?.count ?? 0;
}

async function latestChange(user: TestUser, deckId: string) {
  return (await appRead<DeckChangePage>(user, 'list_deck_changes', { deck_id: deckId })).items[0]!;
}

function linesOf(change: DeckChangePage['items'][number]) {
  return change.lines.map((line) =>
    line.kind === 'copy' ? [line.copy_id, line.place_before, line.place_after] : [line.name, line.count_before, line.count_after],
  );
}

async function planCounts(user: TestUser) {
  return [(await listed(user, { limit: 50 })).items.length, (await listedBuylist(user, { limit: 50 })).items.length];
}

async function onePlan(client: ClaimedAiClient, item: PlannedSwapInput) {
  return (await planned(client, [item])).planned_swaps[0]!.planned_swap_id;
}

function swapIn(user: TestUser, plannedSwapId: string) {
  return appRequest(user, 'swap_in_planned_swap', { planned_swap_id: plannedSwapId });
}

describe('basic lands in create_planned_swaps and create_buylist_cards', () => {
  test('an AI client plans a swap that brings in a basic land, and it holds no copy', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);

    const result = await planned(client, [await bringingIn(client.user, deckId, mountain, { ref: 'mountain', outgoing: { copy_id: bolt } })]);

    expect(result.planned_swaps).toEqual([{ ref: 'mountain', planned_swap_id: expect.any(String), warnings: [] }]);
    expect((await listed(client.user)).items).toEqual([
      expect.objectContaining({
        planned_swap_id: result.planned_swaps[0]!.planned_swap_id,
        incoming: basicLandLine('Mountain'),
        outgoing: expect.objectContaining({ kind: 'copy', copy_id: bolt }),
        as_commander: false,
        status: 'open',
        effect: null,
      }),
    ]);
  });

  test('a planned swap and a buylist card take out a basic land, meaning one fewer of it', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const held = await scannedCopy(client.user, shock);

    const swaps = await planned(client, [
      await plannedSwapItem(client.user, deckId, held, { outgoing: { basic_land_oracle_id: mountain } }),
    ]);
    const cards = await addedToBuylist(client, [
      await buylistCardItem(client.user, deckId, goblinInstigatorCard, { outgoing: { basic_land_oracle_id: mountain } }),
    ]);

    expect(swaps.planned_swaps[0]!.warnings).toEqual([]);
    expect(cards.buylist_cards[0]!.warnings).toEqual([]);
    expect((await listed(client.user)).items[0]).toMatchObject({ outgoing: basicLandLine('Mountain'), effect: null });
    expect((await listedBuylist(client.user)).items[0]).toMatchObject({ outgoing: basicLandLine('Mountain'), effect: null });
  });

  test('the effect counts one more of an incoming basic land', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const effect: DeckChangeEffect = { kind: 'would_make_invalid', rules: [{ rule: 'color_identity', colors: ['U'] }] };

    const { planned_swaps } = await planned(client, [
      await bringingIn(client.user, deckId, island, { outgoing: { basic_land_oracle_id: mountain } }),
    ]);

    expect(planned_swaps[0]!.warnings).toEqual([{ code: 'would_break_validity', effect }]);
    expect((await listed(client.user)).items[0]).toMatchObject({
      incoming: basicLandLine('Island'),
      outgoing: basicLandLine('Mountain'),
      effect,
    });
  });

  test('an open planned swap with the same basic lands in and out refuses a repeat with duplicate_open', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlan(client, await bringingIn(client.user, deckId, island, { outgoing: { basic_land_oracle_id: mountain } }));

    const refusal = await aiClientRefusal(client, 'create_planned_swaps', {
      idempotency_key: 'repeated-lands',
      planned_swaps: [await bringingIn(client.user, deckId, island, { outgoing: { basic_land_oracle_id: mountain } })],
    });

    expect(refusal).toMatchObject({ code: 'duplicate_open' });
    expect(JSON.parse(refusal.details!)).toEqual({ pointer: '/planned_swaps/0', planned_swap_id: plannedSwapId });
    expect(await planCounts(client.user)).toEqual([1, 0]);
  });

  const refusals: [string, string, string, (user: TestUser, deck: KrenkoDeck) => Promise<object>][] = [
    [
      'as_commander with an incoming basic land',
      'invalid_argument',
      'planned_swaps[0].incoming.as_commander',
      async (user, { deckId }) => ({
        planned_swaps: [
          await bringingIn(user, deckId, mountain, {
            incoming: { basic_land_oracle_id: mountain, as_commander: true } as PlannedSwapInput['incoming'],
          }),
        ],
      }),
    ],
    [
      'an incoming copy and an incoming basic land together',
      'invalid_argument',
      'planned_swaps[0].incoming',
      async (user, { deckId }) => ({
        planned_swaps: [
          await bringingIn(user, deckId, mountain, {
            incoming: { basic_land_oracle_id: mountain, copy_id: await scannedCopy(user, shock) } as PlannedSwapInput['incoming'],
          }),
        ],
      }),
    ],
    [
      'an incoming card that is not a basic land',
      'invalid_argument',
      'planned_swaps[0].incoming.basic_land_oracle_id',
      async (user, { deckId }) => ({ planned_swaps: [await bringingIn(user, deckId, krenkoCard)] }),
    ],
    [
      'an outgoing card that is not a basic land',
      'invalid_argument',
      'planned_swaps[0].outgoing.basic_land_oracle_id',
      async (user, { deckId }) => ({
        planned_swaps: [await bringingIn(user, deckId, mountain, { outgoing: { basic_land_oracle_id: krenkoCard } })],
      }),
    ],
    [
      'the same basic land in and out',
      'invalid_argument',
      'planned_swaps[0].outgoing.basic_land_oracle_id',
      async (user, { deckId }) => ({
        planned_swaps: [await bringingIn(user, deckId, mountain, { outgoing: { basic_land_oracle_id: mountain } })],
      }),
    ],
    [
      'a planned swap that takes out a basic land the deck has none of',
      'outgoing_not_in_deck',
      'planned_swaps[0].outgoing.basic_land_oracle_id',
      async (user, { deckId }) => ({
        planned_swaps: [await bringingIn(user, deckId, mountain, { outgoing: { basic_land_oracle_id: forest } })],
      }),
    ],
    [
      'a buylist card that takes out a basic land the deck has none of',
      'outgoing_not_in_deck',
      'buylist_cards[0].outgoing.basic_land_oracle_id',
      async (user, { deckId }) => ({
        buylist_cards: [await buylistCardItem(user, deckId, goblinInstigatorCard, { outgoing: { basic_land_oracle_id: forest } })],
      }),
    ],
    [
      'a buylist card that brings in a basic land',
      'invalid_argument',
      'buylist_cards[0].incoming.basic_land_oracle_id',
      async (user, { deckId }) => ({
        buylist_cards: [
          await buylistCardItem(user, deckId, goblinInstigatorCard, {
            incoming: { basic_land_oracle_id: mountain } as unknown as BuylistCardInput['incoming'],
          }),
        ],
      }),
    ],
  ];

  test.each(refusals)('%s is refused with %s, and the call saves nothing', async (_, code, details, request) => {
    const client = await connectedAiClient();
    const deck = await krenkoDeck(client.user);
    const body = await request(client.user, deck);
    const name = 'planned_swaps' in body ? 'create_planned_swaps' : 'create_buylist_cards';

    expect(await aiClientRefusal(client, name, { idempotency_key: crypto.randomUUID(), ...body })).toMatchObject({ code, details });
    expect(await planCounts(client.user)).toEqual([0, 0]);
  });
});

describe('swap in and Bought with basic lands', () => {
  test('swap in adds one more of an incoming basic land and takes the outgoing copy out in one swapped_in deck change', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlan(client, await bringingIn(client.user, deckId, mountain, { outgoing: { copy_id: bolt } }));

    await swapIn(client.user, plannedSwapId);

    const change = await latestChange(client.user, deckId);
    expect(change).toMatchObject({ kind: 'swapped_in', reason: expect.any(String), client_name: 'ChatGPT' });
    expect(linesOf(change)).toEqual([
      [bolt, 'main', null],
      ['Mountain', 98, 99],
    ]);
    expect(await basicLandCount(client.user, deckId, mountain)).toBe(99);
    expect(await copyOf(client.user, bolt)).toMatchObject({ free: true, deck: null });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'swapped_in' });
  });

  test('swap in takes one fewer of an outgoing basic land', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const held = await scannedCopy(client.user, shock);
    const plannedSwapId = await onePlan(client, await plannedSwapItem(client.user, deckId, held, { outgoing: { basic_land_oracle_id: mountain } }));

    await swapIn(client.user, plannedSwapId);

    expect(linesOf(await latestChange(client.user, deckId))).toEqual([
      [held, null, 'main'],
      ['Mountain', 98, 97],
    ]);
    expect(await basicLandCount(client.user, deckId, mountain)).toBe(97);
    expect(await copyOf(client.user, held)).toMatchObject({ deck: { deck_id: deckId, role: 'main' } });
  });

  test('swap in of a basic land for another basic land changes both counts in one deck change', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlan(client, await bringingIn(client.user, deckId, island, { outgoing: { basic_land_oracle_id: mountain } }));

    await swapIn(client.user, plannedSwapId);

    expect(linesOf(await latestChange(client.user, deckId))).toEqual([
      ['Island', 0, 1],
      ['Mountain', 98, 97],
    ]);
    expect(await basicLandCount(client.user, deckId, island)).toBe(1);
    expect(await basicLandCount(client.user, deckId, mountain)).toBe(97);
  });

  test('Bought takes one fewer of an outgoing basic land in one bought deck change', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const buylistCardId = await oneBuylistCard(client, deckId, goblinInstigatorCard, { outgoing: { basic_land_oracle_id: mountain } });
    const newCopy = await scannedCopy(client.user, goblinInstigator);

    await appRequest(client.user, 'mark_buylist_card_bought', { buylist_card_id: buylistCardId, copy_id: newCopy, unprotect: false });

    const change = await latestChange(client.user, deckId);
    expect(change).toMatchObject({ kind: 'bought' });
    expect(linesOf(change)).toEqual([
      [newCopy, null, 'main'],
      ['Mountain', 98, 97],
    ]);
    expect(await basicLandCount(client.user, deckId, mountain)).toBe(97);
  });
});

describe('closing on its own with basic lands', () => {
  const outgoingLeftDeck = { status: 'closed', close_note: 'outgoing_left_deck' };

  test('changing a basic land card closes each open item whose deck has none left of its outgoing basic land', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const held = await scannedCopy(client.user, shock);
    const plannedSwapId = await onePlan(client, await plannedSwapItem(client.user, deckId, held, { outgoing: { basic_land_oracle_id: mountain } }));
    const buylistCardId = await oneBuylistCard(client, deckId, goblinInstigatorCard, { outgoing: { basic_land_oracle_id: mountain } });
    const mountainsChanged = (by: number) => appRequest(client.user, 'change_basic_land', { deck_id: deckId, oracle_id: mountain, by });

    await mountainsChanged(-97);
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'open' });
    expect((await listedBuylist(client.user)).items[0]).toMatchObject({ status: 'open' });

    await mountainsChanged(-1);
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject(outgoingLeftDeck);
    expect((await listedBuylist(client.user)).items[0]).toMatchObject({ buylist_card_id: buylistCardId, ...outgoingLeftDeck });
    expect(await copyOf(client.user, held)).toMatchObject({ free: true });
  });

  test('a swap in that takes out the last of a basic land closes the other open items that take it out', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Lands');
    await appRequest(client.user, 'change_basic_land', { deck_id: deckId, oracle_id: mountain, by: 1 });
    const first = await onePlan(client, await bringingIn(client.user, deckId, island, { outgoing: { basic_land_oracle_id: mountain } }));
    const second = await onePlan(client, await bringingIn(client.user, deckId, forest, { outgoing: { basic_land_oracle_id: mountain } }));

    await swapIn(client.user, first);

    expect(await basicLandCount(client.user, deckId, mountain)).toBe(0);
    expect(await plannedSwapNamed(client.user, first)).toMatchObject({ status: 'swapped_in' });
    expect(await plannedSwapNamed(client.user, second)).toMatchObject(outgoingLeftDeck);
  });
});
