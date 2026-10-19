import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  closeBuylistCard,
  createBuylistCards,
  listBuylist,
  listFreeCopies,
  markBuylistCardBought,
  mcpCloseBuylistCard,
  type BuylistCard,
  type BuylistCardInput,
} from '../buylist';
import { setCopyProtected } from '../collection';
import { addDeckCard, deleteDeck, getDeck, listDeckChanges, removeDeckCard, setDeckCommander, setDeckPriority, type DeckChangeEffect } from '../decks';
import { createPlannedSwaps, listPlannedSwaps, swapInPlannedSwap } from '../planned-swaps';
import { aiClientCall, aiClientReply, connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { addedToBuylist, buylistCardItem, listedBuylist, oneBuylistCard } from './buylist-card-seeds';
import { catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { call, failed, refused, replyOf } from './database-calls';
import { setCatalogSucceededAt } from './deck-evaluation-seeds';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import {
  addedToDeck,
  backdated,
  codesOf,
  copyOf,
  counterspell,
  deckNamed,
  krenko,
  krenkoDeck,
  lightningBolt,
  listed,
  mountain,
  onePlannedSwap,
  plannedSwapItem,
  reason,
  revisionOf,
  scannedCopies,
  scannedCopy,
  twoItems,
  type KrenkoDeck,
} from './planned-swap-seeds';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const aiClientOnly = 'Only an AI client can call this function.';
let lotusCard: string;
let counterspellCard: string;
let boltCard: string;
let krenkoCard: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  [lotusCard, counterspellCard, boltCard, krenkoCard] = await Promise.all(
    ['Black Lotus', 'Counterspell', 'Lightning Bolt', 'Krenko, Mob Boss'].map(oracleIdOf),
  );
});

async function buylistCardNamed(user: TestUser, buylistCardId: string): Promise<BuylistCard> {
  return (await listedBuylist(user, { limit: 50 })).items.find((item) => item.buylist_card_id === buylistCardId)!;
}

async function imageOfPrinting(printingId: string): Promise<string[]> {
  const [row] = await asDatabaseOwner((database) => database`select image_uris from public.card_printings where id = ${printingId}`);
  return row.image_uris;
}

const open = { status: 'open', close_note: null };

describe('create_buylist_cards', () => {
  test('an AI client adds a buylist card with its reason, and no deck changes', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const revision = await revisionOf(client.user, deckId);

    const result = await addedToBuylist(client, [
      await buylistCardItem(client.user, deckId, boltCard, { ref: 'bolt', outgoing: { copy_id: bolt } }),
    ]);

    expect(result).toEqual({
      buylist_cards: [{ ref: 'bolt', buylist_card_id: expect.any(String), warnings: [] }],
      replayed: false,
    });
    expect((await listedBuylist(client.user)).items).toEqual([
      expect.objectContaining({
        buylist_card_id: result.buylist_cards[0]!.buylist_card_id,
        deck_id: deckId,
        deck_name: 'Krenko',
        incoming: expect.objectContaining({ kind: 'card', oracle_id: boltCard, name: 'Lightning Bolt' }),
        outgoing: expect.objectContaining({ kind: 'copy', copy_id: bolt, name: 'Lightning Bolt' }),
        as_commander: false,
        reason,
        status: 'open',
        close_note: null,
      }),
    ]);
    expect(await revisionOf(client.user, deckId)).toBe(revision);
  });

  test('one call adds 1 to 10 buylist cards, all or none', async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const revision = await revisionOf(client.user, deckId);
    const items: BuylistCardInput[] = [lotusCard, counterspellCard]
      .flatMap((oracleId) => [undefined, bolt, commander].flatMap((outgoing) => [false, true].map((asCommander) => ({ oracleId, outgoing, asCommander }))))
      .slice(0, 11)
      .map(({ oracleId, outgoing, asCommander }, index) => ({
        ref: `card${index}`,
        deck_id: deckId,
        expected_deck_revision: revision,
        incoming: { oracle_id: oracleId, as_commander: asCommander },
        ...(outgoing ? { outgoing: { copy_id: outgoing } } : {}),
        reason,
      }));

    expect(await aiClientCall(client, createBuylistCards, { idempotency_key: 'eleven-cards', buylist_cards: items })).toMatchObject(
      refused('invalid_argument', 'buylist_cards'),
    );
    expect(await aiClientCall(client, createBuylistCards, { idempotency_key: 'no-cards', buylist_cards: [] })).toMatchObject(
      refused('invalid_argument', 'buylist_cards'),
    );
    const { buylist_cards } = await addedToBuylist(client, items.slice(0, 10));

    expect(buylist_cards.map((card) => card.ref)).toEqual(items.slice(0, 10).map((item) => item.ref));
    expect((await listedBuylist(client.user, { limit: 50 })).items).toHaveLength(10);
  });
});

type RefusalCase = {
  code: string;
  field: string | object;
  call: (client: ClaimedAiClient, deck: KrenkoDeck) => Promise<object>;
};

function cardItemOf(user: TestUser, deckId: string) {
  return (index: number) => buylistCardItem(user, deckId, [lotusCard, counterspellCard][index]!);
}

const refusals: [string, RefusalCase][] = [
  [
    'a reason shorter than 20 characters',
    {
      code: 'invalid_argument',
      field: 'buylist_cards[1].reason',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'short-reason',
        buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({ ...item, reason: 'Too short.' })),
      }),
    },
  ],
  [
    'an unknown field',
    {
      code: 'invalid_argument',
      field: 'buylist_cards[1].incoming.copy_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'unknown-field',
        buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({
          ...item,
          incoming: { ...item.incoming, copy_id: crypto.randomUUID() } as BuylistCardInput['incoming'],
        })),
      }),
    },
  ],
  [
    'two buylist cards with one ref',
    {
      code: 'invalid_argument',
      field: 'buylist_cards[1].ref',
      call: async ({ user }, { deckId }) => {
        const [first, second] = await twoItems(cardItemOf(user, deckId), (item) => item);
        return { idempotency_key: 'repeated-ref', buylist_cards: [first, { ...second!, ref: first!.ref }] };
      },
    },
  ],
  [
    'two revisions for one deck',
    {
      code: 'invalid_argument',
      field: 'buylist_cards[1].expected_deck_revision',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'two-revisions',
        buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({ ...item, expected_deck_revision: item.expected_deck_revision - 1 })),
      }),
    },
  ],
  [
    'two buylist cards with the same card, as_commander, and outgoing card',
    {
      code: 'invalid_argument',
      field: 'buylist_cards[1]',
      call: async ({ user }, { deckId }) => {
        const [first] = await twoItems(cardItemOf(user, deckId), (item) => item);
        return { idempotency_key: 'repeated-card', buylist_cards: [first, await buylistCardItem(user, deckId, lotusCard)] };
      },
    },
  ],
  [
    "another user's deck",
    {
      code: 'not_found',
      field: 'buylist_cards[1].deck_id',
      call: async ({ user }, { deckId }) => {
        const othersDeck = await deckNamed(await signUpNewUser(), 'Not yours');
        return { idempotency_key: 'others-deck', buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({ ...item, deck_id: othersDeck })) };
      },
    },
  ],
  [
    "another user's copy as the outgoing card",
    {
      code: 'not_found',
      field: 'buylist_cards[1].outgoing.copy_id',
      call: async ({ user }, { deckId }) => {
        const othersCopy = await scannedCopy(await signUpNewUser(), lightningBolt);
        return {
          idempotency_key: 'others-outgoing',
          buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({ ...item, outgoing: { copy_id: othersCopy } })),
        };
      },
    },
  ],
  [
    'an expected deck revision that is not the deck revision',
    {
      code: 'stale_revision',
      field: { pointer: '/buylist_cards/1/expected_deck_revision', expected: 3, current: 4 },
      call: async ({ user }, { deckId }) => {
        const goblins = await deckNamed(user, 'Goblins');
        const first = await buylistCardItem(user, goblins, lotusCard);
        const stale = await buylistCardItem(user, deckId, counterspellCard);
        return { idempotency_key: 'stale-revision', buylist_cards: [first, { ...stale, expected_deck_revision: stale.expected_deck_revision - 1 }] };
      },
    },
  ],
  [
    'a card that is not in the card catalog',
    {
      code: 'invalid_card',
      field: 'buylist_cards[1].incoming.oracle_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'unknown-card',
        buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({ ...item, incoming: { oracle_id: crypto.randomUUID() } })),
      }),
    },
  ],
  [
    'a basic land card',
    {
      code: 'invalid_card',
      field: 'buylist_cards[1].incoming.oracle_id',
      call: async ({ user }, { deckId }) => ({
        idempotency_key: 'basic-land',
        buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({ ...item, incoming: { oracle_id: mountain } })),
      }),
    },
  ],
  [
    'a card with a free copy that is not protected',
    {
      code: 'free_copy_exists',
      field: { pointer: '/buylist_cards/1/incoming/oracle_id', copy_ids: 'the free copies' },
      call: async ({ user }, { deckId }) => {
        await scannedCopies(user, counterspell, 2);
        return { idempotency_key: 'free-copy', buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => item) };
      },
    },
  ],
  [
    'an outgoing copy that is not in the deck',
    {
      code: 'outgoing_not_in_deck',
      field: 'buylist_cards[1].outgoing.copy_id',
      call: async ({ user }, { deckId }) => {
        const freeCopy = await scannedCopy(user, lightningBolt);
        return { idempotency_key: 'free-outgoing', buylist_cards: await twoItems(cardItemOf(user, deckId), (item) => ({ ...item, outgoing: { copy_id: freeCopy } })) };
      },
    },
  ],
  [
    'the same deck, card, as_commander, and outgoing card as an open buylist card',
    {
      code: 'duplicate_open',
      field: { pointer: '/buylist_cards/1', buylist_card_id: 'the open buylist card' },
      call: async (client, { deckId, bolt }) => {
        await addedToBuylist(client, [await buylistCardItem(client.user, deckId, counterspellCard, { outgoing: { copy_id: bolt } })]);
        return {
          idempotency_key: 'duplicate',
          buylist_cards: await twoItems(cardItemOf(client.user, deckId), (item) => ({ ...item, outgoing: { copy_id: bolt }, reason: `${reason} Again.` })),
        };
      },
    },
  ],
  [
    'the same deck, card, as_commander, and outgoing card as an open planned swap',
    {
      code: 'duplicate_open',
      field: { pointer: '/buylist_cards/1', planned_swap_id: 'the open planned swap' },
      call: async (client, { deckId, bolt }) => {
        await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell), { outgoing: { copy_id: bolt } });
        return {
          idempotency_key: 'duplicate-swap',
          buylist_cards: await twoItems(cardItemOf(client.user, deckId), (item) => ({ ...item, outgoing: { copy_id: bolt } })),
        };
      },
    },
  ],
  [
    'an idempotency key used with different input',
    {
      code: 'idempotency_conflict',
      field: 'idempotency_key',
      call: async (client, { deckId }) => {
        await addedToBuylist(client, [await buylistCardItem(client.user, deckId, krenkoCard)], 'reused-key');
        return { idempotency_key: 'reused-key', buylist_cards: await twoItems(cardItemOf(client.user, deckId), (item) => item) };
      },
    },
  ],
];

describe('refusals', () => {
  test.each(refusals)('%s is refused, and the call saves nothing', async (_, { code, field, call: requestOf }) => {
    const client = await connectedAiClient();
    const deck = await krenkoDeck(client.user);
    const request = await requestOf(client, deck);
    const before = await listedBuylist(client.user);
    const plannedBefore = await listed(client.user);
    const freeCounterspells = (await replyOf(client.user.client, listFreeCopies, { oracle_id: counterspellCard })).items;

    const result = await aiClientCall(client, createBuylistCards, request as never);

    expect(result).toMatchObject(refused(code));
    const refusedField = result.status === 'refused' ? result.refusal.field : null;
    if (typeof field === 'string') {
      expect(refusedField).toBe(field);
    } else {
      const named = {
        buylist_card_id: before.items[0]?.buylist_card_id,
        planned_swap_id: plannedBefore.items[0]?.planned_swap_id,
        copy_ids: freeCounterspells.map((copy) => copy.copy_id).toSorted(),
      };
      const expected = Object.fromEntries(
        Object.entries(field).map(([key, value]) => [key, key in named ? named[key as keyof typeof named] : value]),
      );
      expect(JSON.parse(refusedField!)).toEqual(expected);
    }
    expect(await listedBuylist(client.user)).toEqual(before);
  });

  test('a planned swap is refused with duplicate_open when an open buylist card has the same card, as_commander, and outgoing card', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard, { outgoing: { copy_id: bolt } });
    const held = await scannedCopy(client.user, counterspell);

    const result = await aiClientCall(client, createPlannedSwaps, {
      idempotency_key: 'swap-after-buylist',
      planned_swaps: [await plannedSwapItem(client.user, deckId, held, { outgoing: { copy_id: bolt } })],
    });

    expect(result).toMatchObject(refused('duplicate_open'));
    expect(result.status === 'refused' && JSON.parse(result.refusal.field!)).toEqual({ pointer: '/planned_swaps/0', buylist_card_id: buylistCardId });
    expect((await listed(client.user)).items).toEqual([]);
  });
});

describe('warnings', () => {
  afterEach(() => setCatalogSucceededAt(0));

  test('would_break_validity is the effect of putting the card into the deck', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);

    const { buylist_cards } = await addedToBuylist(client, [await buylistCardItem(client.user, deckId, boltCard)]);

    const effect: DeckChangeEffect = { kind: 'would_make_invalid', rules: [{ rule: 'deck_size' }, { rule: 'singleton' }] };
    expect(buylist_cards[0]!.warnings).toEqual([{ code: 'would_break_validity', effect }]);
    expect((await listedBuylist(client.user)).items[0]).toMatchObject({ status: 'open', effect });
  });

  test('would_break_validity judges a card with as_commander as a commander of the deck', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);

    const { buylist_cards } = await addedToBuylist(client, [
      await buylistCardItem(client.user, deckId, boltCard, {
        incoming: { oracle_id: boltCard, as_commander: true },
        outgoing: { copy_id: commander },
      }),
    ]);

    expect(buylist_cards[0]!.warnings).toContainEqual({
      code: 'would_break_validity',
      effect: { kind: 'would_make_invalid', rules: [{ rule: 'commander_eligibility' }, { rule: 'singleton' }] },
    });
  });

  test('protected_only when every free copy of the card is protected', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const kept = await scannedCopy(client.user, counterspell);
    await replyOf(client.user.client, setCopyProtected, { copy_id: kept, protected: true });

    const { buylist_cards } = await addedToBuylist(client, [await buylistCardItem(client.user, deckId, counterspellCard)]);

    expect(buylist_cards[0]!.warnings).toEqual([{ code: 'protected_only' }]);
  });

  test('in_other_decks names each deck that holds a copy, by deck priority, when no copy is free', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const decks = [];
    for (const [name, priority] of [
      ['Low deck', 'low'],
      ['High deck', 'high'],
    ] as const) {
      const otherDeck = await deckNamed(client.user, name);
      await replyOf(client.user.client, setDeckPriority, { deck_id: otherDeck, priority });
      await addedToDeck(client.user, otherDeck, await scannedCopy(client.user, counterspell));
      decks.push({ deck_id: otherDeck, name, priority });
    }
    await onePlannedSwap(client, await deckNamed(client.user, 'Holding deck'), await scannedCopy(client.user, counterspell));

    const { buylist_cards } = await addedToBuylist(client, [await buylistCardItem(client.user, deckId, counterspellCard)]);

    expect(buylist_cards[0]!.warnings).toEqual([{ code: 'in_other_decks', decks: decks.toReversed() }]);
  });

  test('replaces_commander when the outgoing copy is a commander, and as_commander then defaults to true', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);

    const { buylist_cards } = await addedToBuylist(client, [
      await buylistCardItem(client.user, deckId, lotusCard, { ref: 'default', outgoing: { copy_id: commander } }),
      await buylistCardItem(client.user, deckId, counterspellCard, {
        ref: 'main',
        incoming: { oracle_id: counterspellCard, as_commander: false },
        outgoing: { copy_id: commander },
      }),
    ]);

    expect(codesOf(buylist_cards[0]!.warnings)).toContain('replaces_commander');
    expect(codesOf(buylist_cards[1]!.warnings)).toContain('replaces_commander');
    expect(await buylistCardNamed(client.user, buylist_cards[0]!.buylist_card_id)).toMatchObject({ as_commander: true });
    expect(await buylistCardNamed(client.user, buylist_cards[1]!.buylist_card_id)).toMatchObject({ as_commander: false });
  });

  test('rules_stale when the rules data of the deck is stale', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);

    const before = await addedToBuylist(client, [await buylistCardItem(client.user, deckId, lotusCard, { outgoing: { copy_id: bolt } })]);
    await setCatalogSucceededAt(8);
    const after = await addedToBuylist(client, [await buylistCardItem(client.user, deckId, counterspellCard, { outgoing: { copy_id: bolt } })]);

    expect(codesOf(before.buylist_cards[0]!.warnings)).not.toContain('rules_stale');
    expect(codesOf(after.buylist_cards[0]!.warnings)).toContain('rules_stale');
  });
});

describe('idempotency', () => {
  test('a repeat with the same input returns the first result with replayed: true and saves nothing again', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const request = { idempotency_key: 'retried-call', buylist_cards: [await buylistCardItem(client.user, deckId, lotusCard)] };
    const first = await addedToBuylist(client, request.buylist_cards, request.idempotency_key);
    const saved = await listedBuylist(client.user);

    const repeat = await addedToBuylist(client, request.buylist_cards, request.idempotency_key);

    expect(repeat).toEqual({ ...first, replayed: true });
    expect(await listedBuylist(client.user)).toEqual(saved);
  });
});

describe('list_buylist', () => {
  async function addedAgo(client: ClaimedAiClient, deckId: string, oracleId: string, ago: string) {
    const buylistCardId = await oneBuylistCard(client, deckId, oracleId);
    await backdated('buylist_cards', buylistCardId, ago);
    return buylistCardId;
  }

  function setStatus(buylistCardId: string, status: string) {
    return asDatabaseOwner((database) => database`update public.buylist_cards set status = ${status} where id = ${buylistCardId}`);
  }

  test('lists buylist cards in every state, newest first by default and oldest first on request', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const oldest = await addedAgo(client, deckId, lotusCard, '3 hours');
    const middle = await addedAgo(client, deckId, counterspellCard, '2 hours');
    const newest = await addedAgo(client, deckId, boltCard, '1 hour');
    await setStatus(middle, 'closed');

    const newestFirst = await listedBuylist(client.user);
    const oldestFirst = await listedBuylist(client.user, { order: 'oldest_first' });

    expect(newestFirst.items.map((item) => [item.buylist_card_id, item.status])).toEqual([
      [newest, 'open'],
      [middle, 'closed'],
      [oldest, 'open'],
    ]);
    expect(oldestFirst.items.map((item) => item.buylist_card_id)).toEqual([oldest, middle, newest]);
    expect(newestFirst.next_cursor).toBeNull();
  });

  test("each item has its deck, the card with its default Scryfall printing's image, the outgoing copy line, its reason, and times", async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const buylistCardId = await oneBuylistCard(client, deckId, krenkoCard, { outgoing: { copy_id: bolt } });
    const deck = await replyOf(client.user.client, getDeck, { deck_id: deckId });
    const [times] = await asDatabaseOwner(
      (database) => database`
        select to_jsonb(created_at) as created_at, to_jsonb(status_changed_at) as status_changed_at
        from public.buylist_cards where id = ${buylistCardId}
      `,
    );
    const boltDeckCard = deck.cards.find((card) => card.copy_id === bolt)!;

    expect((await listedBuylist(client.user)).items).toEqual([
      {
        buylist_card_id: buylistCardId,
        deck_id: deckId,
        deck_name: 'Krenko',
        commander_art_crop_uri: deck.commanders.find((item) => item.copy_id === commander)!.art_crop_uri,
        incoming: {
          kind: 'card',
          oracle_id: krenkoCard,
          name: 'Krenko, Mob Boss',
          image_uris: await imageOfPrinting(krenko),
          type_line: 'Legendary Creature — Goblin Warrior',
        },
        outgoing: {
          kind: 'copy',
          copy_id: bolt,
          name: 'Lightning Bolt',
          image_uris: boltDeckCard.image_uris,
          type_line: 'Instant',
          set: boltDeckCard.set,
          collector_number: boltDeckCard.collector_number,
          finish: 'nonfoil',
          condition: 'near_mint',
        },
        as_commander: false,
        reason,
        status: 'open',
        close_note: null,
        ...times,
        effect: { kind: 'would_make_invalid', rules: [{ rule: 'singleton' }] },
      },
    ]);
  });

  test('only an open buylist card has its current effect', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const { buylist_cards } = await addedToBuylist(client, [
      await buylistCardItem(client.user, deckId, boltCard),
      await buylistCardItem(client.user, deckId, boltCard, { incoming: { oracle_id: boltCard, as_commander: true } }),
    ]);
    await setStatus(buylist_cards[1]!.buylist_card_id, 'closed');

    const items = (await listedBuylist(client.user)).items;

    expect(items.find((item) => item.status === 'open')!.effect).toMatchObject({ kind: 'would_make_invalid' });
    expect(items.find((item) => item.status === 'closed')!.effect).toBeNull();
  });

  test("the deck_id and status filters narrow the list, and another user's deck is not found", async () => {
    const client = await connectedAiClient();
    const krenkoDeckId = await deckNamed(client.user, 'Krenko');
    const goblins = await deckNamed(client.user, 'Goblins');
    const inKrenko = await addedAgo(client, krenkoDeckId, lotusCard, '2 hours');
    const closedInGoblins = await addedAgo(client, goblins, counterspellCard, '1 hour');
    const openInGoblins = await addedAgo(client, goblins, boltCard, '30 minutes');
    await setStatus(closedInGoblins, 'closed');
    const othersDeck = await deckNamed(await signUpNewUser(), 'Not yours');

    expect((await listedBuylist(client.user, { deck_id: krenkoDeckId })).items.map((item) => item.buylist_card_id)).toEqual([inKrenko]);
    expect((await listedBuylist(client.user, { deck_id: goblins, status: 'open' })).items.map((item) => item.buylist_card_id)).toEqual([
      openInGoblins,
    ]);
    expect((await listedBuylist(client.user, { status: 'closed' })).items.map((item) => item.buylist_card_id)).toEqual([closedInGoblins]);
    expect(await call(client.user.client, listBuylist, { deck_id: othersDeck })).toMatchObject(refused('not_found', 'deck_id'));
    expect(await call(client.user.client, listBuylist, { status: 'swapped_in' } as never)).toMatchObject(refused('invalid_argument', 'status'));
  });

  test.each([
    ['newest_first', [2, 1, 0]],
    ['oldest_first', [0, 1, 2]],
  ] as const)('pages of 20 by default and at most 50, %s, with a cursor for the next page', async (order, positions) => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const ids = [
      await addedAgo(client, deckId, lotusCard, '3 hours'),
      await addedAgo(client, deckId, counterspellCard, '2 hours'),
      await addedAgo(client, deckId, boltCard, '1 hour'),
    ];

    const first = await listedBuylist(client.user, { order, limit: 2 });
    const second = await listedBuylist(client.user, { order, limit: 2, cursor: first.next_cursor });
    const otherQuery = await call(client.user.client, listBuylist, { order, limit: 2, cursor: first.next_cursor, deck_id: deckId });
    const plannedSwapQuery = await call(client.user.client, listPlannedSwaps, { order, limit: 2, cursor: first.next_cursor });
    const tooMany = await call(client.user.client, listBuylist, { limit: 51 } as never);

    expect([...first.items, ...second.items].map((item) => item.buylist_card_id)).toEqual(positions.map((position) => ids[position]));
    expect(second.next_cursor).toBeNull();
    expect(otherQuery).toMatchObject(refused('invalid_cursor'));
    expect(plannedSwapQuery).toMatchObject(refused('invalid_cursor'));
    expect(tooMany).toMatchObject(refused('invalid_argument', 'limit'));
  });

  test('a page has 20 buylist cards by default', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, lotusCard);
    await asDatabaseOwner(
      (database) => database`
        insert into public.buylist_cards (user_id, deck_id, incoming_oracle_id, as_commander, reason, status)
        select user_id, deck_id, incoming_oracle_id, as_commander, reason, 'closed'
        from public.buylist_cards, generate_series(1, 20)
        where id = ${buylistCardId}
      `,
    );

    const page = await listedBuylist(client.user);

    expect(page.items).toHaveLength(20);
    expect(page.next_cursor).not.toBeNull();
  });
});

describe('access', () => {
  test("create_buylist_cards refuses the app's token, an anonymous caller, and the secret key", async () => {
    const user = await signUpNewUser();
    const deckId = await deckNamed(user, 'Goblins');
    const request = { idempotency_key: 'app-token', buylist_cards: [await buylistCardItem(user, deckId, lotusCard)] };

    expect(await call(user.client, createBuylistCards, request)).toMatchObject({
      status: 'failed',
      error: { code: permissionDenied, message: aiClientOnly },
    });
    for (const other of [anonymousClient(), secretKeyClient()]) {
      expect(await call(other, createBuylistCards, request)).toMatchObject(failed(permissionDenied));
    }
    expect((await listedBuylist(user)).items).toEqual([]);
  });

  test("another user's buylist cards are unreadable", async () => {
    const alice = await connectedAiClient();
    const bob = await signUpNewUser();
    const deckId = await deckNamed(alice.user, 'Goblins');
    await oneBuylistCard(alice, deckId, lotusCard);

    expect((await listedBuylist(alice.user)).items).toHaveLength(1);
    expect((await listedBuylist(bob)).items).toEqual([]);
    expect((await bob.client.from('buylist_cards').select('id')).data).toEqual([]);
    expect(await call(anonymousClient(), listBuylist, {})).toMatchObject(failed(permissionDenied));
  });

  test('direct writes are refused', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, lotusCard);
    const tables: AppClient = client.user.client;

    const writes = [
      await tables.from('buylist_cards').insert({
        user_id: client.user.userId,
        deck_id: deckId,
        incoming_oracle_id: lotusCard,
        as_commander: false,
        reason,
      }),
      await tables.from('buylist_cards').update({ status: 'closed' }).eq('id', buylistCardId),
      await tables.from('buylist_cards').delete().eq('id', buylistCardId),
    ];

    expect(writes.map(({ error }) => error?.code)).toEqual(Array(writes.length).fill(permissionDenied));
    expect((await listedBuylist(client.user)).items).toEqual([expect.objectContaining({ status: 'open' })]);
  });

  test('deleting a deck deletes its buylist cards', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    await oneBuylistCard(client, deckId, lotusCard);

    await replyOf(client.user.client, deleteDeck, { deck_id: deckId });

    expect((await listedBuylist(client.user)).items).toEqual([]);
  });
});

describe('list_free_copies', () => {
  test('lists the free copies of a card across printings, with protected copies, and leaves out copies in a deck or held', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const counterspellPrintings = await asDatabaseOwner(
      (database) => database`select id from public.card_printings where oracle_id = ${counterspellCard} and id <> ${counterspell} limit 1`,
    );
    const otherPrinting = stack(counterspellPrintings[0].id);
    await committed(client.user, scanBatch([otherPrinting]));
    const [free, kept, allocated, held] = await scannedCopies(client.user, counterspell, 4);
    await replyOf(client.user.client, setCopyProtected, { copy_id: kept, protected: true });
    await addedToDeck(client.user, deckId, allocated!);
    await onePlannedSwap(client, deckId, held!);
    await scannedCopy(client.user, lightningBolt);

    const { items } = await replyOf(client.user.client, listFreeCopies, { oracle_id: counterspellCard });

    expect(items.map((item) => [item.copy_id, item.protected]).toSorted()).toEqual(
      [
        [otherPrinting.copy_ids[0], false],
        [free, false],
        [kept, true],
      ].toSorted(),
    );
    expect(items.find((item) => item.copy_id === free)).toMatchObject({ name: 'Counterspell', set: 'lea', collector_number: '54', finish: 'nonfoil' });
  });
});

describe('mark_buylist_card_bought', () => {
  function bought(user: TestUser, buylistCardId: string, copyId: string, unprotect = false) {
    return call(user.client, markBuylistCardBought, { buylist_card_id: buylistCardId, copy_id: copyId, unprotect });
  }

  async function changesOf(user: TestUser, deckId: string) {
    return (await replyOf(user.client, listDeckChanges, { deck_id: deckId })).items;
  }

  test('puts the copy into the deck and takes the outgoing copy out in one bought deck change that keeps the reason', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard, { outgoing: { copy_id: bolt } });
    const newCopy = await scannedCopy(client.user, counterspell);
    const revision = await revisionOf(client.user, deckId);

    expect(await bought(client.user, buylistCardId, newCopy)).toEqual({ status: 'replied', reply: { deck_id: deckId, revision: revision + 1 } });
    const [change] = await changesOf(client.user, deckId);
    expect(change).toMatchObject({ revision: revision + 1, kind: 'bought', reason, reverted: false });
    expect(change!.lines.map((line) => line.kind === 'copy' && [line.copy_id, line.place_before, line.place_after]).toSorted()).toEqual(
      [
        [newCopy, null, 'main'],
        [bolt, 'main', null],
      ].toSorted(),
    );
    expect(await copyOf(client.user, bolt)).toMatchObject({ free: true, deck: null });
    expect(await copyOf(client.user, newCopy)).toMatchObject({ free: false, deck: { deck_id: deckId, role: 'main' } });
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject({ status: 'bought', close_note: null, effect: null });
  });

  test('a protected copy is refused with copy_protected, and goes in unprotected with unprotect: true', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
    const kept = await scannedCopy(client.user, counterspell);
    await replyOf(client.user.client, setCopyProtected, { copy_id: kept, protected: true });

    expect(await bought(client.user, buylistCardId, kept)).toMatchObject(refused('copy_protected', 'copy_id'));
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject(open);
    expect(await revisionOf(client.user, deckId)).toBe(0);

    expect(await bought(client.user, buylistCardId, kept, true)).toMatchObject({ status: 'replied' });
    expect(await copyOf(client.user, kept)).toMatchObject({ protected: false, deck: { deck_id: deckId } });
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject({ status: 'bought', close_note: null });
  });

  test('a buylist card with as_commander makes the copy a commander, replacing the outgoing commander', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const buylistCardId = await oneBuylistCard(client, deckId, krenkoCard, { outgoing: { copy_id: commander } });
    const newCommander = await scannedCopy(client.user, krenko);

    expect(await bought(client.user, buylistCardId, newCommander)).toMatchObject({ status: 'replied' });

    expect((await replyOf(client.user.client, getDeck, { deck_id: deckId })).commanders.map((item) => item.copy_id)).toEqual([newCommander]);
  });

  test('a buylist card with as_commander and no outgoing card is refused with commander_limit when the deck has two commanders', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await replyOf(client.user.client, setDeckCommander, { copy_id: bolt, commander: true });
    const buylistCardId = await oneBuylistCard(client, deckId, krenkoCard, { incoming: { oracle_id: krenkoCard, as_commander: true } });
    const revision = await revisionOf(client.user, deckId);

    expect(await bought(client.user, buylistCardId, await scannedCopy(client.user, krenko))).toMatchObject(
      refused('commander_limit', 'buylist_card_id'),
    );
    expect(await revisionOf(client.user, deckId)).toBe(revision);
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject(open);
  });

  test.each<[string, string, (user: TestUser, client: ClaimedAiClient, deckId: string) => Promise<string>]>([
    ['a copy of another card', 'invalid_argument', (user) => scannedCopy(user, lightningBolt)],
    [
      'a copy in a deck',
      'copy_not_free',
      async (user) => {
        const copyId = await scannedCopy(user, counterspell);
        await addedToDeck(user, await deckNamed(user, 'Other'), copyId);
        return copyId;
      },
    ],
    [
      'a copy that a planned swap holds',
      'copy_not_free',
      async (user, client) => {
        const copyId = await scannedCopy(user, counterspell);
        await onePlannedSwap(client, await deckNamed(user, 'Other'), copyId);
        return copyId;
      },
    ],
    ["another user's copy", 'not_found', async () => scannedCopy(await signUpNewUser(), counterspell)],
  ])('%s is refused with %s, and nothing changes', async (_, code, copyOfCase) => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
    const copyId = await copyOfCase(client.user, client, deckId);

    expect(await bought(client.user, buylistCardId, copyId)).toMatchObject(refused(code, 'copy_id'));
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject(open);
    expect(await revisionOf(client.user, deckId)).toBe(0);
  });

  test('a buylist card that is not open is refused with not_open', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
    await bought(client.user, buylistCardId, await scannedCopy(client.user, counterspell));

    expect(await bought(client.user, buylistCardId, await scannedCopy(client.user, counterspell))).toMatchObject({
      status: 'refused',
      refusal: { code: 'not_open', message: 'The buylist card is bought. Only an open buylist card can change.', field: 'buylist_card_id' },
    });
    expect(await revisionOf(client.user, deckId)).toBe(1);
  });

  test("another user's buylist card is not_found", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
    const stranger = await signUpNewUser();

    expect(await bought(stranger, buylistCardId, await scannedCopy(stranger, counterspell))).toMatchObject({
      status: 'refused',
      refusal: { code: 'not_found', message: 'buylist_card_id is not one of your buylist cards.', field: 'buylist_card_id' },
    });
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject(open);
  });

  test.each(['Bought first', 'add first'] as const)(
    'a Bought and a concurrent add of the same copy put it into one deck only, %s',
    async (first) => {
      const client = await connectedAiClient();
      const deckId = await deckNamed(client.user, 'Goblins');
      const otherDeck = await deckNamed(client.user, 'Other');
      const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
      const copyId = await scannedCopy(client.user, counterspell);
      const buy = async () => bought(client.user, buylistCardId, copyId);
      const add = async () => call(client.user.client, addDeckCard, { deck_id: otherDeck, copy_id: copyId, unprotect: false });

      const { winner, loser } = await asDatabaseOwner((database) =>
        database.begin(async (transaction) => {
          await transaction`select id from public.copies where id = ${copyId} for update`;
          const firstCall = first === 'Bought first' ? buy() : add();
          await Bun.sleep(250);
          const secondCall = first === 'Bought first' ? add() : buy();
          await Bun.sleep(250);
          return { winner: firstCall, loser: secondCall };
        }),
      );

      expect(await winner).toMatchObject({ status: 'replied' });
      expect(await loser).toMatchObject(refused('copy_not_free'));
      expect(await copyOf(client.user, copyId)).toMatchObject({ deck: { deck_id: first === 'Bought first' ? deckId : otherDeck } });
      expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject(first === 'Bought first' ? { status: 'bought', close_note: null } : open);
    },
  );
});

describe('close_buylist_card and mcp_close_buylist_card', () => {
  function closeAsUser(user: TestUser, buylistCardId: string) {
    return call(user.client, closeBuylistCard, { buylist_card_id: buylistCardId });
  }

  test('the user closes an open buylist card with the note closed_by_user, and no deck changes', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);

    expect(await closeAsUser(client.user, buylistCardId)).toEqual({ status: 'replied', reply: { id: buylistCardId, changed: true } });
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject({ status: 'closed', close_note: 'closed_by_user', effect: null });
    expect(await revisionOf(client.user, deckId)).toBe(0);
  });

  test('an AI client closes an open buylist card with the note closed_by_ai_client', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);

    const result = await aiClientReply(client, mcpCloseBuylistCard, { buylist_card_id: buylistCardId });

    expect(result).toEqual({ id: buylistCardId, changed: true });
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject({ status: 'closed', close_note: 'closed_by_ai_client' });
  });

  test('an AI client closes an open buylist card that another AI client made', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);

    const result = await aiClientReply(await connectedAiClient(client.user), mcpCloseBuylistCard, { buylist_card_id: buylistCardId });

    expect(result).toEqual({ id: buylistCardId, changed: true });
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject({ status: 'closed', close_note: 'closed_by_ai_client' });
  });

  test('closing a closed buylist card succeeds and changes nothing, for the user and for an AI client', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
    await replyOf(client.user.client, closeBuylistCard, { buylist_card_id: buylistCardId });
    const closed = await buylistCardNamed(client.user, buylistCardId);

    const byUser = await closeAsUser(client.user, buylistCardId);
    const byAiClient = await aiClientReply(client, mcpCloseBuylistCard, { buylist_card_id: buylistCardId });

    expect(byUser).toEqual({ status: 'replied', reply: { id: buylistCardId, changed: false } });
    expect(byAiClient).toEqual({ id: buylistCardId, changed: false });
    expect(await buylistCardNamed(client.user, buylistCardId)).toEqual(closed);
  });

  test('a bought buylist card is refused with not_open, for the user and for an AI client', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
    await replyOf(client.user.client, markBuylistCardBought, {
      buylist_card_id: buylistCardId,
      copy_id: await scannedCopy(client.user, counterspell),
      unprotect: false,
    });
    const notOpen = {
      status: 'refused',
      refusal: { code: 'not_open', message: 'The buylist card is bought. Only an open buylist card can change.', field: 'buylist_card_id' },
    };

    expect(await closeAsUser(client.user, buylistCardId)).toMatchObject(notOpen);
    expect(await aiClientCall(client, mcpCloseBuylistCard, { buylist_card_id: buylistCardId })).toMatchObject(notOpen);
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject({ status: 'bought', close_note: null });
  });

  test("another user's buylist card is not_found, for the user and for an AI client", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard);
    const notFound = refused('not_found', 'buylist_card_id');

    expect(await closeAsUser(await signUpNewUser(), buylistCardId)).toMatchObject(notFound);
    expect(await aiClientCall(await connectedAiClient(), mcpCloseBuylistCard, { buylist_card_id: buylistCardId })).toMatchObject(notFound);
    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject(open);
  });
});

describe('closing when the outgoing card leaves the deck', () => {
  const outgoingLeftDeck = { status: 'closed', close_note: 'outgoing_left_deck' };

  test('removing the outgoing copy closes its buylist card with the note outgoing_left_deck', async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const leaving = await oneBuylistCard(client, deckId, counterspellCard, { outgoing: { copy_id: bolt } });
    const staying = await oneBuylistCard(client, deckId, lotusCard, { outgoing: { copy_id: commander } });
    const noOutgoing = await oneBuylistCard(client, deckId, krenkoCard);

    await replyOf(client.user.client, removeDeckCard, { copy_id: bolt });

    expect(await buylistCardNamed(client.user, leaving)).toMatchObject(outgoingLeftDeck);
    expect(await buylistCardNamed(client.user, staying)).toMatchObject(open);
    expect(await buylistCardNamed(client.user, noOutgoing)).toMatchObject(open);
  });

  test('a Bought closes the other open planned swaps and buylist cards with the same outgoing copy', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const boughtCard = await oneBuylistCard(client, deckId, counterspellCard, { outgoing: { copy_id: bolt } });
    const otherCard = await oneBuylistCard(client, deckId, lotusCard, { outgoing: { copy_id: bolt } });
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });

    await replyOf(client.user.client, markBuylistCardBought, {
      buylist_card_id: boughtCard,
      copy_id: await scannedCopy(client.user, counterspell),
      unprotect: false,
    });

    expect(await buylistCardNamed(client.user, boughtCard)).toMatchObject({ status: 'bought', close_note: null });
    expect(await buylistCardNamed(client.user, otherCard)).toMatchObject(outgoingLeftDeck);
    expect((await listed(client.user)).items.find((item) => item.planned_swap_id === plannedSwapId)).toMatchObject(outgoingLeftDeck);
  });

  test('a swap in closes an open buylist card with the same outgoing copy', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const buylistCardId = await oneBuylistCard(client, deckId, counterspellCard, { outgoing: { copy_id: bolt } });
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });

    await replyOf(client.user.client, swapInPlannedSwap, { planned_swap_id: plannedSwapId });

    expect(await buylistCardNamed(client.user, buylistCardId)).toMatchObject(outgoingLeftDeck);
  });
});
